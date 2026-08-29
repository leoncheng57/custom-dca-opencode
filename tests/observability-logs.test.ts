import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOG_LIMITS,
  getLogSnapshot,
  isLogSource,
  logSourcePath,
  parseLogLines,
  resetLogCache,
  type AuditLogEntry,
  type TextLogEntry,
} from "../server/logs.js";

const temporary: string[] = [];
afterEach(async () => {
  resetLogCache();
  delete process.env.LOG_DIR;
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function logDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "observability-logs-"));
  temporary.push(directory);
  process.env.LOG_DIR = directory;
  return directory;
}

function auditLine(event: string, payload: Record<string, unknown>, ts = new Date().toISOString()): string {
  return JSON.stringify({ ts, audit: "notification", event, payload });
}

describe("log source resolution", () => {
  it("only accepts the closed enum, never a caller-supplied path", () => {
    expect(isLogSource("audit")).toBe(true);
    expect(isLogSource("stdout")).toBe(true);
    expect(isLogSource("stderr")).toBe(true);
    expect(isLogSource("../../etc/passwd")).toBe(false);
    expect(isLogSource("/var/log/system.log")).toBe(false);
    expect(isLogSource(undefined)).toBe(false);
  });

  it("resolves each source under LOG_DIR", () => {
    const env = { LOG_DIR: "/tmp/logs" } as NodeJS.ProcessEnv;
    expect(logSourcePath("audit", env)).toBe("/tmp/logs/audit.jsonl");
    expect(logSourcePath("stdout", env)).toBe("/tmp/logs/bff.launchd.out.log");
    expect(logSourcePath("stderr", env)).toBe("/tmp/logs/bff.launchd.err.log");
  });
});

describe("log line parsing", () => {
  it("turns an audit line into a typed row with its payload fields", () => {
    const [entry] = parseLogLines(
      [auditLine("notification_decided", { kind: "permission", outcome: "suppressed", suppressionReason: "auto-permissions" }, "2026-08-29T20:04:59.355Z")],
      "audit",
    );
    expect(entry.kind).toBe("audit");
    const audit = entry as AuditLogEntry;
    expect(audit.event).toBe("notification_decided");
    expect(audit.ts).toBe("2026-08-29T20:04:59.355Z");
    expect(audit.fields).toEqual([
      { key: "kind", value: "permission" },
      { key: "outcome", value: "suppressed" },
      { key: "suppressionReason", value: "auto-permissions" },
    ]);
  });

  it("falls back to plain text for malformed JSON without breaking the batch", () => {
    const entries = parseLogLines(["{not valid json", auditLine("webpush_delivery_finished", { sent: 4 })], "audit");
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("text");
    expect((entries[0] as TextLogEntry).text).toBe("{not valid json");
    expect(entries[1].kind).toBe("audit");
  });

  it("treats JSON without the audit discriminator as text", () => {
    const [entry] = parseLogLines([JSON.stringify({ ts: "2026-01-01T00:00:00Z", level: "info" })], "stdout");
    expect(entry.kind).toBe("text");
  });

  it("extracts a bracketed prefix", () => {
    const [entry] = parseLogLines(["[ntfy] delivery failed after 3 attempts"], "stderr");
    const text = entry as TextLogEntry;
    expect(text.prefix).toBe("ntfy");
    expect(text.text).toBe("delivery failed after 3 attempts");
  });

  it("folds stack frames into the line that owns them instead of orphan rows", () => {
    const entries = parseLogLines(
      [
        "BadRequestError: request aborted",
        "    at IncomingMessage.onAborted (raw-body/index.js:245:10)",
        "    at IncomingMessage.emit (node:events:509:20)",
        "[bus] fetch failed",
      ],
      "stderr",
    );
    expect(entries).toHaveLength(2);
    const header = entries[0] as TextLogEntry;
    expect(header.severity).toBe("error");
    expect(header.frames).toHaveLength(2);
    expect((entries[1] as TextLogEntry).prefix).toBe("bus");
  });

  it("caps folded frames rather than growing without bound", () => {
    const frames = Array.from({ length: LOG_LIMITS.maxFrames + 10 }, (_, index) => `    at frame${index} (file.js:${index}:1)`);
    const [entry] = parseLogLines(["TypeError: boom", ...frames], "stderr");
    const header = entry as TextLogEntry;
    expect(header.frames).toHaveLength(LOG_LIMITS.maxFrames);
    expect(header.framesTruncated).toBe(true);
  });

  it("truncates a pathologically long line", () => {
    const [entry] = parseLogLines(["x".repeat(LOG_LIMITS.maxLineChars + 500)], "stdout");
    const text = entry as TextLogEntry;
    expect(text.text.length).toBe(LOG_LIMITS.maxLineChars + 1);
    expect(text.text.endsWith("…")).toBe(true);
  });

  it("assigns stable ids scoped to the source", () => {
    const entries = parseLogLines(["one", "two"], "stderr");
    expect(entries.map((entry) => entry.id)).toEqual(["stderr-0", "stderr-1"]);
  });
});

describe("bounded reads", () => {
  it("reports a missing file rather than throwing", async () => {
    await logDir();
    const snapshot = await getLogSnapshot("audit");
    expect(snapshot.exists).toBe(false);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.truncated).toBe(false);
  });

  it("caps the number of rows as the file grows and keeps the newest", async () => {
    const directory = await logDir();
    const file = path.join(directory, "audit.jsonl");
    const lines = Array.from({ length: LOG_LIMITS.maxEntries + 200 }, (_, index) =>
      auditLine("notification_decided", { recordCorrelation: String(index) }),
    );
    await writeFile(file, `${lines.join("\n")}\n`);

    const snapshot = await getLogSnapshot("audit");
    expect(snapshot.entries).toHaveLength(LOG_LIMITS.maxEntries);
    expect(snapshot.truncated).toBe(true);
    const last = snapshot.entries[snapshot.entries.length - 1] as AuditLogEntry;
    expect(last.fields[0].value).toBe(String(LOG_LIMITS.maxEntries + 199));
  });

  it("reads only the trailing window of an oversized file", async () => {
    const directory = await logDir();
    const file = path.join(directory, "bff.launchd.out.log");
    // One clearly-identifiable first line, then enough padding to exceed the window.
    await writeFile(file, "[bff] FIRST LINE THAT MUST NOT APPEAR\n");
    const padding = `${"[bff] ".padEnd(200, "x")}\n`;
    for (let index = 0; index < Math.ceil(LOG_LIMITS.tailBytes / padding.length) + 50; index++) {
      await appendFile(file, padding);
    }

    const snapshot = await getLogSnapshot("stdout");
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.sizeBytes).toBeGreaterThan(LOG_LIMITS.tailBytes);
    expect(snapshot.entries.some((entry) => entry.kind === "text" && entry.text.includes("FIRST LINE"))).toBe(false);
  });

  it("serves a cached snapshot until refresh is requested", async () => {
    const directory = await logDir();
    const file = path.join(directory, "audit.jsonl");
    await writeFile(file, `${auditLine("auto_approval_reply", { outcome: "approved" })}\n`);

    const first = await getLogSnapshot("audit");
    expect(first.entries).toHaveLength(1);

    await appendFile(file, `${auditLine("auto_approval_reply", { outcome: "not_found" })}\n`);
    expect((await getLogSnapshot("audit")).entries).toHaveLength(1);
    expect((await getLogSnapshot("audit", true)).entries).toHaveLength(2);
  });
});
