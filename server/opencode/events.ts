// server/opencode/events.ts
//
// One upstream SSE subscription, fanned out to every browser client.
//
// Why fan out rather than let browsers connect directly:
//   - the OpenCode credential stays server-side
//   - N browser tabs do not become N upstream subscriptions
//   - we can filter per-project before anything crosses the wire
//
// Two things the API forces:
//   - Subscribe to /global/event, NOT /event. The latter is directory-scoped,
//     so a multi-project UI subscribing to it silently misses everything
//     outside one directory. /global/event wraps each event as
//     `{ directory, project?, workspace?, payload }`.
//   - Tolerate unknown event types. `server.heartbeat` fires every 10s and is
//     absent from the published event union; more will be added.

import { EventEmitter } from "node:events";

import { eventStreamUrl, type OpencodeConfig } from "./client.js";

/** A server event, already unwrapped from the /global/event envelope. */
export interface OpencodeEvent {
  /** e.g. "session.idle", "message.part.updated", "permission.asked". */
  type: string;
  properties: Record<string, unknown>;
  /** Project this event belongs to, from the envelope. */
  directory?: string;
}

interface Envelope {
  directory?: string;
  payload?: { type?: string; properties?: Record<string, unknown> };
  // /event (non-global) delivers the bare event; tolerate both.
  type?: string;
  properties?: Record<string, unknown>;
}

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Long-lived subscription to the OpenCode event bus.
 *
 * Reconnects with exponential backoff forever — the upstream server may be
 * restarted (a launchd unit will bring it back) and the UI should recover
 * without a page reload. Consumers subscribe with `.on("event", …)`.
 */
export class EventBus extends EventEmitter {
  private controller: AbortController | null = null;
  private backoff = RECONNECT_MIN_MS;
  private stopped = false;
  private connected = false;

  constructor(private readonly config: OpencodeConfig) {
    super();
    // Many browser tabs may attach; the default limit of 10 is too low and its
    // warning is noise rather than signal here.
    this.setMaxListeners(0);
  }

  isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    if (this.stopped) return;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
    this.connected = false;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.connect();
        // A clean end still means we lost the stream; reconnect.
        this.backoff = RECONNECT_MIN_MS;
      } catch (error) {
        if (this.stopped) return;
        this.emit("error", error);
      }
      this.connected = false;
      this.emit("disconnected");
      if (this.stopped) return;
      await new Promise((resolve) => setTimeout(resolve, this.backoff));
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    }
  }

  private async connect(): Promise<void> {
    this.controller = new AbortController();
    const res = await fetch(eventStreamUrl(this.config), {
      headers: { Accept: "text/event-stream" },
      signal: this.controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`event stream failed: HTTP ${res.status}`);
    }

    this.connected = true;
    this.backoff = RECONNECT_MIN_MS;
    this.emit("connected");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let split: number;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        this.handleFrame(frame);
      }
    }
  }

  private handleFrame(frame: string): void {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(data) as Envelope;
    } catch {
      return; // Never let a malformed frame kill the stream.
    }

    const inner = envelope.payload ?? envelope;
    const type = inner.type;
    if (!type) return;

    this.emit("event", {
      type,
      properties: inner.properties ?? {},
      directory: envelope.directory,
    } satisfies OpencodeEvent);
  }
}

/**
 * Event types the UI reacts to. Everything else is forwarded untouched —
 * filtering here would mean a server upgrade silently breaks a feature.
 */
export const UI_EVENT_TYPES = [
  "session.created",
  "session.updated",
  "session.deleted",
  "session.idle",
  "session.error",
  "session.status",
  "message.updated",
  "message.part.updated",
  "message.part.delta",
  "todo.updated",
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
] as const;
