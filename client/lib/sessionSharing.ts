import type { Attachment, TranscriptEvent } from "./transcript.js";

export type ShareTarget =
  | { kind: "session" }
  | { kind: "message"; messageId: string; role: "user" | "assistant" };

interface ExportAttachment {
  filename: string;
  mime?: string;
}

interface ExportEntry {
  type: "message" | "thought" | "tool" | "status" | "error";
  timestamp: string;
  author?: "user" | "assistant";
  text?: string;
  attachments?: ExportAttachment[];
  label?: string;
  status?: string;
  durationMs?: number;
}

interface SessionExport {
  version: 1;
  title: string;
  exportedAt: string;
  entries: ExportEntry[];
}

function attachmentMetadata(items: Attachment[]): ExportAttachment[] | undefined {
  const attachments = items.map(({ filename, mime }) => ({
    filename: filename.trim() || "file",
    ...(mime ? { mime } : {}),
  }));
  return attachments.length ? attachments : undefined;
}

function entriesFor(events: TranscriptEvent[], target: ShareTarget): ExportEntry[] {
  const selected = target.kind === "session"
    ? events
    : events.filter((event) => event.messageId === target.messageId);

  return selected.flatMap((event): ExportEntry[] => {
    if (event.kind === "user" && (target.kind === "session" || target.role === "user")) {
      return [{
        type: "message",
        author: "user",
        timestamp: event.timestamp,
        text: event.text,
        attachments: attachmentMetadata(event.attachments),
      }];
    }
    if (event.kind === "agent" && (target.kind === "session" || target.role === "assistant")) {
      return [{ type: "message", author: "assistant", timestamp: event.timestamp, text: event.text }];
    }
    if (target.kind !== "session") return [];

    switch (event.kind) {
      case "thought":
        return [{
          type: "thought",
          timestamp: event.timestamp,
          text: event.text,
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        }];
      case "tool":
        // Tool input and output can contain secrets or whole file bodies. The
        // export records only the same bounded activity identity/status needed
        // to understand the transcript chronology.
        return [{
          type: "tool",
          timestamp: event.timestamp,
          label: event.name,
          status: event.status,
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        }];
      case "status":
        return [{ type: "status", timestamp: event.timestamp, label: event.label }];
      case "patch":
        return [{
          type: "status",
          timestamp: event.timestamp,
          label: event.fileCount === 1 ? "Changed 1 file" : `Changed ${event.fileCount} files`,
        }];
      case "error":
        return [{ type: "error", timestamp: event.timestamp, text: event.message }];
      default:
        return [];
    }
  }).map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const difference = Date.parse(left.entry.timestamp) - Date.parse(right.entry.timestamp);
      return (Number.isFinite(difference) && difference !== 0) ? difference : left.index - right.index;
    })
    .map(({ entry }) => entry);
}

function cleanTitle(title: string): string {
  return title.replace(/[\r\n]+/g, " ").trim() || "Session";
}

function markdownText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function markdownEntry(entry: ExportEntry): string {
  const timestamp = entry.timestamp ? ` · ${entry.timestamp}` : "";
  if (entry.type === "message") {
    const heading = entry.author === "user" ? "Your message" : "Assistant message";
    const body = markdownText(entry.text ?? "");
    const attachments = entry.attachments?.map((item) =>
      `- Attachment: ${item.filename}${item.mime ? ` (${item.mime})` : ""}`,
    ).join("\n");
    return [`## ${heading}${timestamp}`, body, attachments].filter(Boolean).join("\n\n");
  }
  if (entry.type === "thought") {
    return `### Thought${timestamp}\n\n${markdownText(entry.text ?? "")}`;
  }
  if (entry.type === "tool") {
    const duration = entry.durationMs === undefined ? "" : ` · ${entry.durationMs} ms`;
    return `### Tool${timestamp}\n\n${entry.label ?? "tool"} · ${entry.status ?? "unknown"}${duration}`;
  }
  if (entry.type === "status") return `### Activity${timestamp}\n\n${entry.label ?? "Activity"}`;
  return `### Error${timestamp}\n\n${markdownText(entry.text ?? "The agent turn failed.")}`;
}

export function serializeShareMarkdown(
  title: string,
  events: TranscriptEvent[],
  target: ShareTarget,
): string {
  const heading = target.kind === "session"
    ? `# ${cleanTitle(title)}`
    : `# ${target.role === "user" ? "Your message" : "Assistant message"}`;
  const entries = entriesFor(events, target);
  return `${[heading, ...entries.map(markdownEntry)].join("\n\n")}\n`;
}

export function serializeSessionJson(
  title: string,
  events: TranscriptEvent[],
  exportedAt = new Date().toISOString(),
): string {
  const payload: SessionExport = {
    version: 1,
    title: cleanTitle(title),
    exportedAt,
    entries: entriesFor(events, { kind: "session" }),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function shareFilename(title: string, extension: "md" | "json"): string {
  const stem = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80) || "session";
  return `${stem}.${extension}`;
}

export function validatedShareUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === ""
      ? url.href
      : null;
  } catch {
    return null;
  }
}
