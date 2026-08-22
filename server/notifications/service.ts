import type { OpencodeConfig } from "../opencode/client.js";
import type { EventBus, OpencodeEvent } from "../opencode/events.js";
import { listPermissions, parsePermissionRequest, type PermissionRequest } from "../opencode/permissions.js";
import { getSessionMetadata, parseSessionMetadata, type SessionMetadata } from "../opencode/sessions.js";
import { sendNtfy, type NotificationMessage } from "./ntfy.js";
import { HistoryStore, type NotificationDelivery } from "./history.js";
import { PreferenceStore, type NotificationPreferences, type NotifyEvent } from "./preferences.js";
import { eventClickUrl } from "../publicAppUrl.js";

export function classifyEvent(event: OpencodeEvent): NotifyEvent | null {
  if (event.type === "session.idle") return "idle";
  if (event.type === "permission.asked") return "permission";
  if (event.type === "question.asked") return "question";
  if (event.type === "session.error") {
    const error = event.properties.error;
    return error && typeof error === "object" && (error as Record<string, unknown>).name === "MessageAbortedError"
      ? "abort"
      : "error";
  }
  return null;
}

function permission(event: OpencodeEvent): PermissionRequest | null {
  return parsePermissionRequest(event.properties);
}

/** Upstream is inconsistent about which key carries the request id. */
function requestIdOf(properties: Record<string, unknown>): string | undefined {
  const candidate = properties.requestID ?? properties.id;
  return typeof candidate === "string" && candidate ? candidate : undefined;
}

type SessionMetadataLookup = (
  directory: string,
  sessionID: string,
  signal: AbortSignal,
) => Promise<SessionMetadata | null>;

type SessionKind = "root" | "child" | "unknown";

const SESSION_CACHE_LIMIT = 500;
const SESSION_CACHE_MS = 5 * 60_000;
const UNKNOWN_SESSION_CACHE_MS = 5_000;
const SESSION_LOOKUP_TIMEOUT_MS = 2_000;
const SESSION_LOOKUP_CONCURRENCY = 4;

export class NotificationService {
  private timers = new Map<string, NodeJS.Timeout>();
  private seen = new Map<string, number>();
  private sessionKinds = new Map<string, { kind: SessionKind; expiresAt: number }>();
  private sessionLookups = new Map<string, Promise<SessionKind>>();
  private activeSessionLookups = 0;
  private readonly onEvent = (event: OpencodeEvent) => void this.handle(event);
  private readonly lookupSessionMetadata: SessionMetadataLookup;

  constructor(
    private readonly config: OpencodeConfig,
    private readonly bus: EventBus,
    private readonly store: PreferenceStore,
    private readonly history: HistoryStore,
    private readonly publicAppUrl: string | null = null,
    private readonly autoPermissionsEnabled: (directory: string | undefined) => boolean = () => false,
    lookupSessionMetadata?: SessionMetadataLookup,
  ) {
    this.lookupSessionMetadata = lookupSessionMetadata
      ?? ((directory, sessionID, signal) => getSessionMetadata(this.config, directory, sessionID, signal));
  }

  start(): void {
    this.bus.on("event", this.onEvent);
  }

  stop(): void {
    this.bus.off("event", this.onEvent);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async handle(event: OpencodeEvent): Promise<void> {
    this.observeSessionMetadata(event);

    if (event.type === "permission.replied") {
      const id = String(event.properties.requestID ?? "");
      const key = `${event.directory ?? ""}:${id}`;
      const timer = this.timers.get(key);
      if (timer) clearTimeout(timer);
      this.timers.delete(key);
      return;
    }

    const kind = classifyEvent(event);
    if (!kind) return;

    const sessionID = String(event.properties.sessionID ?? "");
    if (await this.sessionKind(event.directory, sessionID) === "child") return;

    // Deduplicate before recording: a repeat inside 5s is an upstream echo,
    // not a second notification, and logging it would inflate the badge.
    const identity = String(event.properties.id ?? event.properties.requestID ?? event.properties.sessionID ?? "");
    const dedupeKey = `${event.directory ?? ""}:${event.type}:${identity}`;
    const now = Date.now();
    if (now - (this.seen.get(dedupeKey) ?? 0) < 5_000) return;
    this.seen.set(dedupeKey, now);
    if (this.seen.size > 500) {
      for (const [key, timestamp] of this.seen) {
        if (now - timestamp > 60_000) this.seen.delete(key);
      }
    }

    const preferences = await this.store.read();
    const details = kind === "permission" ? permission(event) : null;
    const message: NotificationMessage = {
      event: kind,
      title: kind === "permission" ? "OpenCode needs permission" : `OpenCode: ${kind}`,
      body: details ? `${details.permission} requires review` : `Session ${sessionID || "updated"}`,
      click: eventClickUrl(this.publicAppUrl, event),
    };
    const requestID = requestIdOf(event.properties);
    const common = {
      kind,
      ...(event.directory ? { directory: event.directory } : {}),
      ...(sessionID ? { sessionID } : {}),
      ...(requestID ? { requestID } : {}),
      title: message.title,
      body: message.body,
      ...(message.click ? { click: message.click } : {}),
    };

    // Auto-approved permissions still belong in the user's checklist — "why
    // was I never asked?" is exactly the question the log should answer.
    if (event.type === "permission.asked" && this.autoPermissionsEnabled(event.directory)) {
      const record = await this.history.append({
        ...common,
        delivery: { ntfy: "off", desktop: "off", suppressed: "auto-permissions" },
      });
      this.emitRecorded(record.id, event.directory, sessionID);
      return;
    }

    const delivery = await this.deliver(preferences, message);
    const record = await this.history.append({ ...common, delivery });
    this.emitRecorded(record.id, event.directory, sessionID);

    if (kind === "permission" && details && event.directory) {
      this.scheduleParked(event.directory, details, preferences.parkedPermissionSeconds);
    }
  }

  private sessionKey(directory: string, sessionID: string): string {
    return `${directory}\0${sessionID}`;
  }

  private observeSessionMetadata(event: OpencodeEvent): void {
    if (!event.directory) return;
    if (event.type === "session.deleted") {
      const metadata = parseSessionMetadata(event.properties.info);
      if (metadata) this.sessionKinds.delete(this.sessionKey(event.directory, metadata.id));
      return;
    }
    if (event.type !== "session.created" && event.type !== "session.updated") return;
    const metadata = parseSessionMetadata(event.properties.info);
    if (!metadata) return;
    this.rememberSessionKind(
      this.sessionKey(event.directory, metadata.id),
      metadata.parentID ? "child" : "root",
      SESSION_CACHE_MS,
    );
  }

  private async sessionKind(directory: string | undefined, sessionID: string): Promise<SessionKind> {
    // Events without a scoped identity cannot be verified, so fail open rather
    // than hiding a legitimate root notification.
    if (!directory || !sessionID) return "unknown";
    const key = this.sessionKey(directory, sessionID);
    const cached = this.sessionKinds.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.kind;
    if (cached) this.sessionKinds.delete(key);

    const existing = this.sessionLookups.get(key);
    if (existing) return existing;

    const lookup = this.lookupSessionKind(directory, sessionID)
      .then((kind) => {
        const observed = this.sessionKinds.get(key);
        if (observed && observed.expiresAt > Date.now()) return observed.kind;
        this.rememberSessionKind(
          key,
          kind,
          kind === "unknown" ? UNKNOWN_SESSION_CACHE_MS : SESSION_CACHE_MS,
        );
        return kind;
      })
      .finally(() => this.sessionLookups.delete(key));
    this.sessionLookups.set(key, lookup);
    return lookup;
  }

  private async lookupSessionKind(directory: string, sessionID: string): Promise<SessionKind> {
    // Under a burst, fail open immediately instead of building an unbounded
    // queue that delays root notifications and retains every incoming event.
    if (this.activeSessionLookups >= SESSION_LOOKUP_CONCURRENCY) return "unknown";
    this.activeSessionLookups += 1;
    try {
      const metadata = await this.lookupSessionMetadata(
        directory,
        sessionID,
        AbortSignal.timeout(SESSION_LOOKUP_TIMEOUT_MS),
      );
      if (!metadata || metadata.id !== sessionID) return "unknown";
      return metadata.parentID ? "child" : "root";
    } catch (error) {
      console.warn("[notification-session]", error instanceof Error ? error.message : String(error));
      return "unknown";
    } finally {
      this.activeSessionLookups -= 1;
    }
  }

  private rememberSessionKind(key: string, kind: SessionKind, ttl: number): void {
    this.sessionKinds.delete(key);
    this.sessionKinds.set(key, { kind, expiresAt: Date.now() + ttl });
    while (this.sessionKinds.size > SESSION_CACHE_LIMIT) {
      const oldest = this.sessionKinds.keys().next().value;
      if (oldest === undefined) break;
      this.sessionKinds.delete(oldest);
    }
  }

  /** Browser nudge emitted only after the durable append completes. */
  private emitRecorded(id: string, directory: string | undefined, sessionID: string): void {
    this.bus.emit("event", {
      type: "notification.recorded",
      properties: { id, ...(sessionID ? { sessionID } : {}) },
      ...(directory ? { directory } : {}),
    } satisfies OpencodeEvent);
  }

  /** Send over every enabled channel and report what actually happened. */
  private async deliver(
    preferences: NotificationPreferences,
    message: NotificationMessage,
  ): Promise<NotificationDelivery> {
    // The BFF has no view of open tabs, so this is the preference, not proof.
    const desktop =
      preferences.browser.desktop && preferences.browser.events[message.event] ? "allowed" : "off";
    const wantsNtfy =
      preferences.ntfy.enabled && Boolean(preferences.ntfy.topic) && preferences.ntfy.events[message.event];
    if (!wantsNtfy) return { ntfy: "off", desktop };
    try {
      await sendNtfy(preferences, message);
      return { ntfy: "sent", desktop };
    } catch (error) {
      const ntfyError = error instanceof Error ? error.message : String(error);
      console.warn("[ntfy]", ntfyError);
      return { ntfy: "failed", ntfyError, desktop };
    }
  }

  private scheduleParked(directory: string, pending: PermissionRequest, seconds: number): void {
    const key = `${directory}:${pending.id}`;
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (this.autoPermissionsEnabled(directory)) return;
        void this.sessionKind(directory, pending.sessionID)
          .then((kind) => kind === "child" ? [] : listPermissions(this.config, directory))
          .then(async (requests) => {
            if (!requests.some((item) => item.id === pending.id)) return;
            const preferences = await this.store.read();
            const message: NotificationMessage = {
              event: "parked",
              title: "OpenCode is parked",
              body: `${pending.permission} has waited ${seconds}s for a reply`,
              priority: "high",
              click: eventClickUrl(this.publicAppUrl, {
                type: "permission.asked",
                properties: { sessionID: pending.sessionID },
                directory,
              }),
            };
            const delivery = await this.deliver(preferences, message);
            // The parked alert escalates an already-counted permission. It is
            // logged for the record but must not add a second active item.
            const record = await this.history.append({
              kind: "parked",
              directory,
              sessionID: pending.sessionID,
              requestID: pending.id,
              title: message.title,
              body: message.body,
              ...(message.click ? { click: message.click } : {}),
              delivery,
            });
            this.emitRecorded(record.id, directory, pending.sessionID);
            await this.history.markParked(directory, pending.id);
            this.bus.emit("event", {
              type: "notification.parked",
              properties: { requestID: pending.id, sessionID: pending.sessionID },
              directory,
            } satisfies OpencodeEvent);
          })
          .catch((error) => console.warn("[parked-permission]", String(error)));
      }, seconds * 1000),
    );
  }
}
