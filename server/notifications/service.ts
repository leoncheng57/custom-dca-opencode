import type { OpencodeConfig } from "../opencode/client.js";
import { request } from "../opencode/client.js";
import type { EventBus, OpencodeEvent } from "../opencode/events.js";
import { sendNtfy, type NotificationMessage } from "./ntfy.js";
import { PreferenceStore, type NotifyEvent } from "./preferences.js";
import { eventClickUrl } from "../publicAppUrl.js";

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
}

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
  const source = event.properties;
  return typeof source.id === "string" && typeof source.sessionID === "string"
    ? {
        id: source.id,
        sessionID: source.sessionID,
        permission: typeof source.permission === "string" ? source.permission : "permission",
        patterns: Array.isArray(source.patterns) ? source.patterns.map(String) : [],
      }
    : null;
}

export class NotificationService {
  private timers = new Map<string, NodeJS.Timeout>();
  private seen = new Map<string, number>();
  private readonly onEvent = (event: OpencodeEvent) => void this.handle(event);

  constructor(
    private readonly config: OpencodeConfig,
    private readonly bus: EventBus,
    private readonly store: PreferenceStore,
    private readonly publicAppUrl: string | null = null,
  ) {}

  start(): void {
    this.bus.on("event", this.onEvent);
  }

  stop(): void {
    this.bus.off("event", this.onEvent);
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
      return;
    }
    const kind = classifyEvent(event);
    if (!kind) return;
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
    await sendNtfy(preferences, message).catch((error) => console.warn("[ntfy]", String(error)));
    if (kind === "permission" && details && event.directory) {
      this.scheduleParked(event.directory, details, preferences.parkedPermissionSeconds);
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
        void request<PermissionRequest[]>(this.config, "/permission", { directory })
          .then(async (requests) => {
            if (!requests.some((item) => item.id === pending.id)) return;
            const preferences = await this.store.read();
            await sendNtfy(preferences, {
              event: "parked",
              title: "OpenCode is parked",
              body: `${pending.permission} has waited ${seconds}s for a reply`,
              priority: "high",
              click: eventClickUrl(this.publicAppUrl, {
                type: "permission.asked",
                properties: { sessionID: pending.sessionID },
                directory,
              }),
            });
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
