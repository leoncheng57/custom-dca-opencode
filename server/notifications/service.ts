import { request, type OpencodeConfig } from "../opencode/client.js";
import type { EventBus, OpencodeEvent } from "../opencode/events.js";
import { listPermissions, parsePermissionRequest, type PermissionRequest } from "../opencode/permissions.js";
import { parseQuestionRequests } from "../opencode/questions.js";
import { requireWorkspaceDirectory } from "../paths.js";
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

/** Reconciling on every history read would hammer upstream; 5s is enough. */
const RECONCILE_THROTTLE_MS = 5_000;

export class NotificationService {
  private timers = new Map<string, NodeJS.Timeout>();
  private seen = new Map<string, number>();
  private reconciledAt = new Map<string, number>();
  private reconcileQueue: Promise<void> = Promise.resolve();
  private readonly onEvent = (event: OpencodeEvent) => void this.handle(event);
  // A reconnect means events were missed while the stream was down, so the
  // active set on disk may name requests that have since been answered.
  private readonly onConnected = () => void this.reconcileAll(true);

  constructor(
    private readonly config: OpencodeConfig,
    private readonly bus: EventBus,
    private readonly store: PreferenceStore,
    private readonly history: HistoryStore,
    private readonly publicAppUrl: string | null = null,
    private readonly autoPermissionsEnabled: (directory: string | undefined) => boolean = () => false,
  ) {}

  start(): void {
    this.bus.on("event", this.onEvent);
    this.bus.on("connected", this.onConnected);
  }

  stop(): void {
    this.bus.off("event", this.onEvent);
    this.bus.off("connected", this.onConnected);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async handle(event: OpencodeEvent): Promise<void> {
    if (event.type === "permission.replied") {
      const id = String(event.properties.requestID ?? "");
      const key = `${event.directory ?? ""}:${id}`;
      const timer = this.timers.get(key);
      if (timer) clearTimeout(timer);
      this.timers.delete(key);
      if (id) await this.resolveRequest(event.directory, id);
      return;
    }
    // Whether upstream emits these at all is unverified, so reconciliation —
    // not this branch — is the dependable way a question record gets closed.
    if (event.type === "question.replied" || event.type === "question.rejected") {
      const id = requestIdOf(event.properties);
      if (id) await this.resolveRequest(event.directory, id);
      return;
    }

    const kind = classifyEvent(event);
    if (!kind) return;

    // Deduplicate before recording: a repeat inside 5s is an upstream echo,
    // not a second notification, and logging it would inflate the badge.
    const identity = String(event.properties.id ?? event.properties.requestID ?? event.properties.sessionID ?? "");
    const dedupeKey = `${event.type}:${identity}`;
    const now = Date.now();
    if (now - (this.seen.get(dedupeKey) ?? 0) < 5_000) return;
    this.seen.set(dedupeKey, now);
    if (this.seen.size > 500) {
      for (const [key, timestamp] of this.seen) {
        if (now - timestamp > 60_000) this.seen.delete(key);
      }
    }

    const preferences = await this.store.read();
    const sessionID = String(event.properties.sessionID ?? "");
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

    // Auto-approved permissions still belong in the log — "why was I never
    // asked?" is exactly the question the log should answer — but they are
    // born resolved so they can never hold the badge.
    if (event.type === "permission.asked" && this.autoPermissionsEnabled(event.directory)) {
      await this.history.append({
        ...common,
        delivery: { ntfy: "off", browser: "off", suppressed: "auto-permissions" },
        resolvedBy: "suppressed",
      });
      return;
    }

    const delivery = await this.deliver(preferences, message);
    await this.history.append({ ...common, delivery });

    if (kind === "permission" && details && event.directory) {
      this.scheduleParked(event.directory, details, preferences.parkedPermissionSeconds);
    }
  }

  /** Send over every enabled channel and report what actually happened. */
  private async deliver(
    preferences: NotificationPreferences,
    message: NotificationMessage,
  ): Promise<NotificationDelivery> {
    // The BFF has no view of open tabs, so this is the preference, not proof.
    const browser =
      preferences.browser.desktop && preferences.browser.events[message.event] ? "allowed" : "off";
    const wantsNtfy =
      preferences.ntfy.enabled && Boolean(preferences.ntfy.topic) && preferences.ntfy.events[message.event];
    if (!wantsNtfy) return { ntfy: "off", browser };
    try {
      await sendNtfy(preferences, message);
      return { ntfy: "sent", browser };
    } catch (error) {
      const ntfyError = error instanceof Error ? error.message : String(error);
      console.warn("[ntfy]", ntfyError);
      return { ntfy: "failed", ntfyError, browser };
    }
  }

  private resolveRequest(directory: string | undefined, requestID: string): Promise<number> {
    return this.history.resolve(
      (record) => record.requestID === requestID && record.directory === directory,
      "replied",
    );
  }

  /**
   * Close active records whose upstream request no longer exists.
   *
   * Records outlive the process, so a reply that lands while the BFF is down
   * would otherwise leave a badge nobody can clear. This is also the only
   * reliable path for questions, whose reply events are unverified.
   */
  async reconcileAll(force = false): Promise<void> {
    const run = this.reconcileQueue.then(async () => {
      const now = Date.now();
      await this.history.expireStale(now);
      for (const directory of await this.history.activeDirectories()) {
        if (!force && now - (this.reconciledAt.get(directory) ?? 0) < RECONCILE_THROTTLE_MS) continue;
        this.reconciledAt.set(directory, now);
        await this.reconcileDirectory(directory);
      }
    });
    this.reconcileQueue = run.catch((error: unknown) => {
      console.warn("[notification-reconcile]", error instanceof Error ? error.message : String(error));
    });
    return this.reconcileQueue;
  }

  private async reconcileDirectory(directory: string): Promise<void> {
    let canonical: string;
    try {
      // Never let a recorded path send us at an arbitrary host directory.
      canonical = await requireWorkspaceDirectory(directory);
    } catch {
      await this.history.resolve((record) => record.directory === directory, "stale");
      return;
    }
    const [permissions, questions] = await Promise.all([
      listPermissions(this.config, canonical).catch(() => null),
      request<unknown>(this.config, "/question", { directory: canonical })
        .then(parseQuestionRequests)
        .catch(() => null),
    ]);
    // A failed lookup is not evidence of a reply; leave those records alone.
    if (permissions) {
      const pending = new Set(permissions.map((item) => item.id));
      await this.history.resolve(
        (record) => record.kind === "permission" && record.directory === directory && !pending.has(record.requestID ?? ""),
        "reconciled",
      );
    }
    if (questions) {
      const pending = new Set(questions.map((item) => item.id));
      await this.history.resolve(
        (record) => record.kind === "question" && record.directory === directory && !pending.has(record.requestID ?? ""),
        "reconciled",
      );
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
        void listPermissions(this.config, directory)
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
            await this.history.append({
              kind: "parked",
              directory,
              sessionID: pending.sessionID,
              requestID: pending.id,
              title: message.title,
              body: message.body,
              ...(message.click ? { click: message.click } : {}),
              delivery,
            });
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
