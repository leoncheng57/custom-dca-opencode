import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AuditLogWriter,
  auditLogPath,
  auditLogDirectory,
} from "../server/notifications/auditLog.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "audit-retention-"));
  temporary.push(directory);
  return directory;
}

function line(index: number, at = new Date()): string {
  return JSON.stringify({
    ts: at.toISOString(),
    audit: "notification",
    event: "notification_decided",
    payload: { recordCorrelation: String(index).padStart(16, "0"), kind: "idle", outcome: "delivered" },
  });
}

describe("audit log path resolution", () => {
  it("prefers LOG_DIR over the repository default", () => {
    expect(auditLogDirectory({ LOG_DIR: "/tmp/logs" } as NodeJS.ProcessEnv)).toBe("/tmp/logs");
    expect(auditLogPath({ LOG_DIR: "/tmp/logs" } as NodeJS.ProcessEnv)).toBe("/tmp/logs/audit.jsonl");
  });

  it("lets AUDIT_LOG_FILE override the whole path", () => {
    const env = { LOG_DIR: "/tmp/logs", AUDIT_LOG_FILE: "/var/audit.jsonl" } as NodeJS.ProcessEnv;
    expect(auditLogPath(env)).toBe("/var/audit.jsonl");
  });

  it("falls back to .state/logs under the working directory", () => {
    expect(auditLogDirectory({} as NodeJS.ProcessEnv)).toBe(path.resolve(process.cwd(), ".state/logs"));
  });
});

describe("audit log writing", () => {
  it("appends one JSON line per event and creates the directory", async () => {
    const file = path.join(await root(), "nested", "audit.jsonl");
    const writer = new AuditLogWriter(file);
    writer.append(line(1));
    writer.append(line(2));
    await writer.flush();

    const contents = await readFile(file, "utf8");
    const lines = contents.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).audit).toBe("notification");
    expect(contents.endsWith("\n")).toBe(true);
  });

  it("creates the file 0600 so audit history is not world-readable", async () => {
    const file = path.join(await root(), "audit.jsonl");
    const writer = new AuditLogWriter(file);
    writer.append(line(1));
    await writer.flush();

    const info = await stat(file);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("never throws when the destination is unwritable", async () => {
    // A path whose parent is a file, not a directory: mkdir must fail.
    const directory = await root();
    const blocker = path.join(directory, "blocker");
    await writeFile(blocker, "not a directory");
    const writer = new AuditLogWriter(path.join(blocker, "audit.jsonl"));

    writer.append(line(1));
    await expect(writer.flush()).resolves.toBeUndefined();
  });
});

describe("audit log retention", () => {
  it("drops the oldest lines once the byte budget is exceeded", async () => {
    const file = path.join(await root(), "audit.jsonl");
    // Small budget so the trim is reached without writing megabytes.
    const writer = new AuditLogWriter(file, { maxBytes: 4_096, maxAgeMs: 90 * 24 * 60 * 60 * 1000 });

    for (let index = 0; index < 400; index++) writer.append(line(index));
    await writer.flush();

    const info = await stat(file);
    expect(info.size).toBeLessThanOrEqual(4_096);

    // The survivors must be the NEWEST lines, not an arbitrary slice.
    const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]) as { payload: { recordCorrelation: string } };
    expect(Number(last.payload.recordCorrelation)).toBe(399);
  });

  it("drops lines older than the age budget", async () => {
    const file = path.join(await root(), "audit.jsonl");
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const recent = new Date();
    // Seed directly so the age sweep has something to find on first append.
    await writeFile(file, `${line(1, old)}\n${line(2, recent)}\n`, { mode: 0o600 });

    const writer = new AuditLogWriter(file, { maxBytes: 8 * 1024 * 1024, maxAgeMs: 30 * 24 * 60 * 60 * 1000 });
    // Force the sweep rather than waiting an hour of wall clock.
    (writer as unknown as { lastAgeSweep: number }).lastAgeSweep = 0;
    writer.append(line(3, recent));
    await writer.flush();

    const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
    const ids = lines.map((entry) => Number((JSON.parse(entry) as { payload: { recordCorrelation: string } }).payload.recordCorrelation));
    expect(ids).toEqual([2, 3]);
  });

  it("keeps unparseable lines rather than silently deleting corruption", async () => {
    const file = path.join(await root(), "audit.jsonl");
    await writeFile(file, `not json at all\n${line(1)}\n`, { mode: 0o600 });

    const writer = new AuditLogWriter(file, { maxBytes: 8 * 1024 * 1024, maxAgeMs: 30 * 24 * 60 * 60 * 1000 });
    (writer as unknown as { lastAgeSweep: number }).lastAgeSweep = 0;
    writer.append(line(2));
    await writer.flush();

    const contents = await readFile(file, "utf8");
    expect(contents).toContain("not json at all");
  });

  it("leaves no temporary files behind after a trim", async () => {
    const directory = await root();
    const file = path.join(directory, "audit.jsonl");
    const writer = new AuditLogWriter(file, { maxBytes: 4_096, maxAgeMs: 90 * 24 * 60 * 60 * 1000 });

    for (let index = 0; index < 400; index++) writer.append(line(index));
    await writer.flush();

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(directory);
    expect(entries.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });
});
