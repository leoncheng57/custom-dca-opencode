// server/notifications/ptyAudit.ts — the evidence trail for terminal sessions.
//
// Every other action in this app leaves something behind: a transcript row, a
// notification record, a run-log entry. PTY bytes land nowhere, and a terminal
// is the largest privilege grant in the product (AGENTS.md #16). So the three
// moments that matter are recorded here:
//
//   started  — a shell was spawned, with its command and working directory
//   attached — a browser opened a socket onto it, with the origin it came from
//   exited   — the process ended, with its exit code
//
// Scope, stated honestly:
//   - The BYTE STREAM is not retained. Recording keystrokes and output would
//     capture secrets typed at a prompt and printed by tools, and this app has
//     no place to store that safely. What is recorded is that a shell existed,
//     who reached it and when — enough to answer "was a terminal open?" without
//     becoming a keylogger.
//   - `pty.deleted` is not recorded separately; a kill produces `pty.exited`
//     and a second row would double-count the same ending.
//   - Delivery defaults to OFF for this kind (see preferences.ts). The record
//     is written regardless of delivery, because an audit trail that only
//     exists when someone enabled alerts is not an audit trail.

import type { EventBus, OpencodeEvent } from "../opencode/events.js";
import { sendNtfy } from "./ntfy.js";
import type { HistoryStore, NotificationDelivery } from "./history.js";
import type { PreferenceStore } from "./preferences.js";

interface PtyInfo {
  id: string;
  title?: string;
  command?: string;
  cwd?: string;
}

function parsePtyInfo(value: unknown): PtyInfo | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) return null;
  return {
    id: source.id,
    ...(typeof source.title === "string" ? { title: source.title } : {}),
    ...(typeof source.command === "string" ? { command: source.command } : {}),
    ...(typeof source.cwd === "string" ? { cwd: source.cwd } : {}),
  };
}

function projectName(directory: string | undefined): string {
  return directory?.split("/").filter(Boolean).at(-1) ?? "unknown project";
}

/** Keep a body one readable line; a cwd can be very long. */
function truncate(value: string, limit = 160): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export class PtyAuditService {
  private readonly onEvent = (event: OpencodeEvent) => void this.handle(event);

  constructor(
    private readonly bus: EventBus,
    private readonly store: PreferenceStore,
    private readonly history: HistoryStore,
  ) {}

  start(): void {
    this.bus.on("event", this.onEvent);
  }

  stop(): void {
    this.bus.off("event", this.onEvent);
  }

  private async handle(event: OpencodeEvent): Promise<void> {
    if (event.type === "pty.created") {
      const info = parsePtyInfo(event.properties.info);
      if (!info) return;
      const where = info.cwd ? ` in ${info.cwd}` : "";
      await this.record(
        event.directory,
        "Terminal started",
        truncate(`${info.title || info.id}: ${info.command ?? "shell"}${where}`),
      );
      return;
    }
    if (event.type === "pty.exited") {
      const id = typeof event.properties.id === "string" ? event.properties.id : null;
      if (!id) return;
      const exitCode = event.properties.exitCode;
      const suffix = typeof exitCode === "number" ? ` with exit code ${exitCode}` : "";
      await this.record(event.directory, "Terminal exited", `${id} ended${suffix}`);
    }
  }

  /**
   * Called by the WebSocket proxy, not the event bus: an attach is a BFF-side
   * fact that upstream never emits, and it is the one that says a human (or a
   * page) actually reached the shell.
   */
  recordAttach(input: { directory: string; ptyID: string; readOnly: boolean; origin: string }): void {
    const mode = input.readOnly ? "read-only" : "interactive";
    void this.record(
      input.directory,
      "Terminal attached",
      truncate(`${input.ptyID} attached ${mode} from ${input.origin}`),
    );
  }

  private async record(directory: string | undefined, title: string, body: string): Promise<void> {
    const delivery = await this.deliver(directory, title, body);
    const record = await this.history.append({
      kind: "pty",
      ...(directory ? { directory } : {}),
      title,
      body,
      delivery,
    });
    // Only after the durable append, so a browser refreshing its badge cannot
    // race ahead of the record it is counting.
    this.bus.emit("event", {
      type: "notification.recorded",
      properties: { id: record.id },
      ...(directory ? { directory } : {}),
    } satisfies OpencodeEvent);
  }

  /**
   * Mirrors NotificationService.deliver, including its central honesty: the BFF
   * cannot see whether a browser rendered anything, so "allowed" is intent.
   */
  private async deliver(
    directory: string | undefined,
    title: string,
    body: string,
  ): Promise<NotificationDelivery> {
    let preferences;
    try {
      preferences = await this.store.read();
    } catch {
      // A broken preferences file must not lose the audit record.
      return { ntfy: "off", desktop: "off" };
    }
    const desktop = preferences.browser.desktop && preferences.browser.events.pty ? "allowed" : "off";
    const wantsNtfy =
      preferences.ntfy.enabled && Boolean(preferences.ntfy.topic) && preferences.ntfy.events.pty;
    if (!wantsNtfy) return { ntfy: "off", desktop };
    try {
      await sendNtfy(preferences, {
        event: "pty",
        title,
        body: `${body} (${projectName(directory)})`,
      });
      return { ntfy: "sent", desktop };
    } catch (error) {
      const ntfyError = error instanceof Error ? error.message : String(error);
      console.warn("[ntfy]", ntfyError);
      return { ntfy: "failed", ntfyError, desktop };
    }
  }
}
