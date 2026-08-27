import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { BridgeNotification } from "../server/dsh/bridge.js";
import { DshTrajectoryStore } from "../server/dsh/trajectory.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function fixture(sensitiveEnabled = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dsh-trajectory-"));
  temporary.push(root);
  return { root, store: new DshTrajectoryStore(path.join(root, "trajectory"), { sensitiveEnabled, allowedProviders: ["deepseek"], allowedModels: ["safe-model"] }), sessionId: "dsh-test-session" };
}

function notification(sessionId: string, event: Record<string, unknown>): BridgeNotification {
  return { type: "notification", sessionId, notification: { method: "session.event", payload: { sessionId, event } } };
}

function childNotification(rootSessionId: string, nativeSessionId: string, event: Record<string, unknown>): BridgeNotification {
  return { type: "notification", sessionId: rootSessionId, notification: { method: "session.event", payload: { sessionId: nativeSessionId, event } } };
}

describe("DCA-captured DSH trajectory projection", () => {
  it("keeps raw prompt, command, path, context, reasoning, and tool content out of safe summaries", async () => {
    const { store, sessionId } = await fixture();
    const fakeApiKey = ["sk", "1234567890abcdef"].join("-");
    await store.appendBridge(notification(sessionId, {
      type: "request/header", seq: 0, time: 1_700_000_000_000,
      data: { reason: "initial", header: { config: { provider: "deepseek", model: "safe-model" }, system: "RAW SYSTEM PROMPT /private/secret", tools: [{ name: "bash", description: "run rm -rf" }] } },
    }));
    await store.appendBridge(notification(sessionId, {
      type: "tool/call", seq: 1, time: 1_700_000_000_001,
      data: { turn: 0, step: 0, callId: "call-1", name: "bash", arguments: JSON.stringify({ command: "cat /private/secret", apiKey: fakeApiKey }) },
    }));
    await store.appendBridge(notification(sessionId, {
      type: "assistant/message", seq: 2, time: 1_700_000_000_002,
      data: { turn: 0, step: 0, message: { content: [{ type: "reasoning", text: "PRIVATE REASONING" }, { type: "text", text: "PRIVATE OUTPUT" }] }, usage: { inputTokens: 10, outputTokens: 4, reasoningTokens: 2 } },
      sourceEventSeqs: [1], surfaceOp: { op: "replace", start: 0, end: 1 },
    }));

    const exported = await store.export(sessionId);
    const safe = JSON.stringify(exported);
    expect(safe).not.toContain("RAW SYSTEM PROMPT");
    expect(safe).not.toContain("/private/secret");
    expect(safe).not.toContain("rm -rf");
    expect(safe).not.toContain("PRIVATE REASONING");
    expect(safe).not.toContain("PRIVATE OUTPUT");
    expect(safe).not.toContain('"bash"');
    expect(exported.events[2]).toMatchObject({ nativeSeq: 2, sourceEventSeqs: [1], surfaceOp: { op: "replace", start: 0, end: 1 } });
    expect(exported.events[2].metadata?.usage).toEqual({ inputTokens: 10, outputTokens: 4, reasoningTokens: 2 });

    const detail = await store.detail(sessionId, exported.events.find((event) => event.type === "tool/call")!.id);
    expect(JSON.stringify(detail)).toContain("cat /private/secret");
    expect(JSON.stringify(detail)).not.toContain(fakeApiKey);
    expect(JSON.stringify(detail)).toContain("[REDACTED]");
  });

  it("deduplicates native seq while keeping DCA observation order and gap coverage", async () => {
    const { store, sessionId } = await fixture();
    await Promise.all([
      store.appendBridge(notification(sessionId, { type: "turn/start", seq: 4, time: 1_700_000_000_004, data: { turn: 1 } })),
      store.appendBridge(notification(sessionId, { type: "step/start", seq: 6, time: 1_700_000_000_006, data: { turn: 1, step: 0 } })),
    ]);
    await store.appendBridge(notification(sessionId, { type: "turn/start", seq: 4, time: 1_700_000_000_004, data: { turn: 1 } }));
    await store.appendLifecycle(sessionId, "dca/cancelled-by-user");

    const page = await store.page(sessionId);
    expect(page.events.map((event) => event.observationSeq)).toEqual([1, 2, 3]);
    expect(page.events.map((event) => event.nativeSeq)).toEqual([4, 6, undefined]);
    expect(page.coverage.nativeStreams).toHaveLength(1);
    expect(page.coverage.nativeStreams[0]).toMatchObject({ first: 4, last: 6, gaps: 1 });
  });

  it("records malformed native events as an explicit capture gap", async () => {
    const { store, sessionId } = await fixture();
    await store.appendBridge(notification(sessionId, { type: "assistant/chunk", time: 1_700_000_000_000, data: { chunk: { type: "text-delta", text: "secret" } } }));
    const page = await store.page(sessionId);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({ type: "dca/capture-gap", category: "error", title: "Malformed native event was not captured", hasDetail: false });
  });

  it("persists projection directories as 0700 and files as 0600", async () => {
    const { root, store, sessionId } = await fixture();
    await store.appendLifecycle(sessionId, "dca/session-created", { workspaceId: "fixture" });
    await store.flush(sessionId);
    const directory = path.join(root, "trajectory");
    const file = path.join(directory, `${sessionId}.jsonl`);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toContain('"observationSeq":1');
  });

  it("does not persist sensitive detail when capture is disabled", async () => {
    const { root, store, sessionId } = await fixture(false);
    await store.appendBridge(notification(sessionId, { type: "user/message", seq: 0, time: 1_700_000_000_000, data: { content: "DO NOT PERSIST", source: { kind: "user" } }, surfaceOp: "append" }));
    const exported = await store.export(sessionId);
    expect(exported.events[0].hasDetail).toBe(false);
    expect(await store.detail(sessionId, exported.events[0].id)).toBeNull();
    expect(await readFile(path.join(root, "trajectory", `${sessionId}.jsonl`), "utf8")).not.toContain("DO NOT PERSIST");
  });

  it("redacts consecutive credential-shaped keys", async () => {
    const { store, sessionId } = await fixture();
    const encoded = JSON.stringify({ password: "hunter2", padding: "x".repeat(3_000) });
    await store.appendLifecycle(sessionId, "dca/session-created", { password: "first", secret: "second", apiKey: "third", arguments: encoded });
    const event = (await store.export(sessionId)).events[0];
    const detail = await store.detail(sessionId, event.id);
    expect(JSON.stringify(detail)).not.toContain("first");
    expect(JSON.stringify(detail)).not.toContain("second");
    expect(JSON.stringify(detail)).not.toContain("third");
    expect(JSON.stringify(detail)).not.toContain("hunter2");
  });

  it("keeps root and child native sequences distinct and maps SDK lineage notifications", async () => {
    const { store, sessionId } = await fixture();
    await store.appendBridge(notification(sessionId, { type: "turn/start", seq: 0, time: 1_700_000_000_000, data: { turn: 1 } }));
    await store.appendBridge({ type: "notification", sessionId, notification: { method: "subagent.started", payload: { parentSessionId: sessionId, childSessionId: "dsh-child", provider: "spawn" } } });
    await store.appendBridge(childNotification(sessionId, "dsh-child", { type: "subagent/descriptor", seq: 0, time: 1_700_000_000_001, data: { version: 2, mode: "one-shot", provider: "spawn", label: "PRIVATE CHILD LABEL" } }));
    await store.appendBridge({ type: "notification", sessionId, notification: { method: "subagent.finished", payload: { parentSessionId: sessionId, childSessionId: "dsh-child", status: "completed", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "PRIVATE CHILD OUTPUT" }] } } });
    const page = await store.page(sessionId);
    expect(page.events.filter((event) => event.nativeSeq === 0)).toHaveLength(2);
    expect(page.coverage.nativeStreams).toHaveLength(2);
    expect(page.events.map((event) => event.title)).toEqual(["Turn 1 started", "Child agent started", "Child descriptor committed", "Child agent finished"]);
    expect(JSON.stringify(await store.export(sessionId))).not.toContain("PRIVATE CHILD");
  });

  it("preserves known-empty lineage and labels unknown required events as contract-significant", async () => {
    const { store, sessionId } = await fixture();
    await store.appendBridge(notification(sessionId, { type: "assistant/message", seq: 0, time: 1_700_000_000_000, data: { turn: 1, step: 1, message: { id: "a", role: "assistant", content: [] } }, sourceEventSeqs: [], surfaceOp: "append" }));
    await store.appendBridge(notification(sessionId, { type: "plugin/private-event", seq: 1, time: 1_700_000_000_001, data: { prompt: "PRIVATE" } }));
    await store.appendBridge(notification(sessionId, { type: "plugin/informational", seq: 2, time: 1_700_000_000_002, data: { prompt: "PRIVATE" }, ignorable: true }));
    const events = (await store.export(sessionId)).events;
    expect(events[0].sourceEventSeqs).toEqual([]);
    expect(events[1]).toMatchObject({ type: "unknown", category: "error", title: "Unsupported required DSH event" });
    expect(events[2]).toMatchObject({ type: "unknown", category: "status", title: "Unknown ignorable DSH event", ignorable: true });
  });

  it("marks oversized source lineage explicitly", async () => {
    const { store, sessionId } = await fixture();
    await store.appendBridge(notification(sessionId, { type: "assistant/message", seq: 0, time: 1_700_000_000_000, data: { turn: 1, step: 1, message: { id: "a", role: "assistant", content: [] } }, sourceEventSeqs: Array.from({ length: 5_001 }, (_, index) => index), surfaceOp: "append" }));
    const event = (await store.export(sessionId)).events[0];
    expect(event.sourceEventSeqs).toHaveLength(5_000);
    expect(event.sourceEventSeqsTruncated).toBe(true);
  });

  it("does not publish a cache-only event when persistence fails", async () => {
    const { root, store, sessionId } = await fixture();
    await store.appendLifecycle(sessionId, "dca/session-created");
    const file = path.join(root, "trajectory", `${sessionId}.jsonl`);
    await chmod(file, 0o400);
    await expect(store.appendLifecycle(sessionId, "dca/cancelled-by-user")).rejects.toThrow();
    expect((await store.page(sessionId)).events.map((event) => event.type)).toEqual(["dca/session-created"]);
    await chmod(file, 0o600);
  });

  it("bounds the persisted detail after JSON escaping, not just before it", async () => {
    const { root, store, sessionId } = await fixture();
    // Escaping-heavy: every character costs 2 bytes as `\"`, and control
    // characters cost 6 as `\u00XX`, so a pre-escape bound would overshoot.
    await store.appendLifecycle(sessionId, "dca/session-created", { blob: `${'"'.repeat(40_000)}${"\u0001".repeat(20_000)}` });
    await store.flush(sessionId);
    const event = (await store.export(sessionId)).events[0];
    const detail = await store.detail(sessionId, event.id);
    expect(detail?.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(detail?.detail), "utf8")).toBeLessThanOrEqual(16 * 1024);
    const persisted = JSON.parse((await readFile(path.join(root, "trajectory", `${sessionId}.jsonl`), "utf8")).trim()) as { detail: unknown };
    expect(Buffer.byteLength(JSON.stringify(persisted.detail), "utf8")).toBeLessThanOrEqual(16 * 1024);
  });

  it("redacts the same credential labels in free-form text as in structured keys", async () => {
    const { store, sessionId } = await fixture();
    const secrets = ["alpha-authorization", "bravo-cookie", "charlie-access", "delta-refresh", "echo-session"];
    await store.appendLifecycle(sessionId, "dca/session-created", {
      note: [
        `Authorization: Basic ${secrets[0]}`,
        `cookie=session=${secrets[1]}`,
        `access_token=${secrets[2]}`,
        `refresh_token: "${secrets[3]}"`,
        `session_id=${secrets[4]}`,
      ].join("\n"),
    });
    const event = (await store.export(sessionId)).events[0];
    const detail = JSON.stringify(await store.detail(sessionId, event.id));
    for (const secret of secrets) expect(detail).not.toContain(secret);
    expect(detail).toContain("[REDACTED]");
  });

  it("removes expired events on the first read after restart", async () => {
    const { root, store, sessionId } = await fixture();
    await store.appendLifecycle(sessionId, "dca/session-created");
    const file = path.join(root, "trajectory", `${sessionId}.jsonl`);
    const event = JSON.parse((await readFile(file, "utf8")).trim()) as Record<string, unknown>;
    event.observedAt = "2020-01-01T00:00:00.000Z";
    await writeFile(file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    const restarted = new DshTrajectoryStore(path.join(root, "trajectory"));
    expect((await restarted.page(sessionId)).events).toEqual([]);
    expect(await readFile(file, "utf8")).toBe("");
  });
});
