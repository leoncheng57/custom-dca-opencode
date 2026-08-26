import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  InstructionAuditStore,
  redactInstructionText,
} from "../server/opencode/instruction-audit.js";

async function temporaryFile(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "instruction-audit-"));
  return path.join(dir, "audit.json");
}

describe("instruction text redaction", () => {
  it("redacts credential-shaped substrings", () => {
    expect(redactInstructionText("push with ghp_abcdefghijklmnopqrstuvwx please"))
      .toBe("push with [redacted-token] please");
    expect(redactInstructionText("use sk-abcdefghijklmnop1234 for the call"))
      .toBe("use [redacted-token] for the call");
    const header = redactInstructionText("header Authorization: Bearer abc.def-ghi_jkl");
    expect(header).not.toContain("abc.def-ghi_jkl");
    expect(header).toContain("[redacted]");
    expect(redactInstructionText("send Bearer abc.def-ghi_jkl with the call"))
      .toBe("send Bearer [redacted] with the call");
    expect(redactInstructionText("set api_key=supersecretvalue then run"))
      .toBe("set api_key=[redacted] then run");
    expect(redactInstructionText("clone https://user:hunter2@example.com/repo.git"))
      .toBe("clone https://[redacted]@example.com/repo.git");
  });

  it("leaves ordinary development artifacts alone", () => {
    const text = "Rebase onto 59d8e63f00c0ffee and run npm test in /tmp/project; task_id ses_abc123";
    expect(redactInstructionText(text)).toBe(text);
  });
});

describe("InstructionAuditStore", () => {
  it("appends redacted bounded records and lists them newest first per session", async () => {
    const store = new InstructionAuditStore(await temporaryFile());
    await store.append({
      source: "managed-child-launch",
      directory: "/tmp/project",
      targetSessionID: "ses_child1",
      parentSessionID: "ses_parent",
      targetAgent: "build",
      text: `run with ghp_abcdefghijklmnopqrstuvwx ${"x".repeat(5_000)}`,
      delivery: "acknowledged",
    });
    await store.append({
      source: "managed-child-prompt",
      directory: "/tmp/project",
      targetSessionID: "ses_child1",
      text: "second instruction",
      delivery: "rejected",
      reason: "upstream said no with token ghp_abcdefghijklmnopqrstuvwx",
    });
    await store.append({
      source: "managed-child-launch",
      directory: "/tmp/other",
      targetSessionID: "ses_child1",
      text: "different directory",
      delivery: "acknowledged",
    });

    const byParent = await store.list("/tmp/project", "ses_parent");
    expect(byParent).toHaveLength(1);
    expect(byParent[0].text).toContain("[redacted-token]");
    expect(byParent[0].text.length).toBeLessThanOrEqual(4_000);
    expect(byParent[0].truncated).toBe(true);

    const byChild = await store.list("/tmp/project", "ses_child1");
    expect(byChild.map((record) => record.source))
      .toEqual(["managed-child-prompt", "managed-child-launch"]);
    expect(byChild[0].reason).toContain("[redacted-token]");

    // The directory scope is part of the query, not a client-side filter.
    expect(await store.list("/tmp/elsewhere", "ses_child1")).toEqual([]);
  });

  it("persists across instances and starts empty on a corrupt file", async () => {
    const file = await temporaryFile();
    const store = new InstructionAuditStore(file);
    await store.append({
      source: "managed-child-launch",
      directory: "/tmp/project",
      targetSessionID: "ses_child",
      text: "hello",
      delivery: "acknowledged",
    });
    await store.flush();

    const reloaded = new InstructionAuditStore(file);
    const records = await reloaded.list("/tmp/project", "ses_child");
    expect(records).toHaveLength(1);
    expect(records[0].text).toBe("hello");

    const raw = await readFile(file, "utf8");
    expect(JSON.parse(raw).version).toBe(1);

    await writeFile(file, "not json at all");
    const corrupt = new InstructionAuditStore(file);
    expect(await corrupt.list("/tmp/project", "ses_child")).toEqual([]);
  });

  it("caps retention at the configured limit, dropping the oldest", async () => {
    const store = new InstructionAuditStore(await temporaryFile(), 3);
    for (let index = 0; index < 5; index += 1) {
      await store.append({
        source: "managed-child-prompt",
        directory: "/tmp/project",
        targetSessionID: "ses_child",
        text: `instruction ${index}`,
        delivery: "acknowledged",
      });
    }
    const records = await store.list("/tmp/project", "ses_child");
    expect(records.map((record) => record.text)).toEqual([
      "instruction 4",
      "instruction 3",
      "instruction 2",
    ]);
  });

  it("drops malformed persisted entries instead of failing the load", async () => {
    const file = await temporaryFile();
    await writeFile(file, JSON.stringify({
      version: 1,
      records: [
        { nonsense: true },
        {
          id: "keep",
          at: 5,
          source: "managed-child-launch",
          directory: "/tmp/project",
          targetSessionID: "ses_child",
          text: "kept",
          delivery: "acknowledged",
        },
        { id: "bad-delivery", at: 6, source: "managed-child-launch", directory: "/tmp/project", targetSessionID: "ses_child", text: "x", delivery: "queued" },
      ],
    }));
    const store = new InstructionAuditStore(file);
    const records = await store.list("/tmp/project", "ses_child");
    expect(records.map((record) => record.id)).toEqual(["keep"]);
  });
});
