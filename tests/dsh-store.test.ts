import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DshSessionStore } from "../server/dsh/store.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("DSH session store", () => {
  it("normalizes streamed and committed assistant events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dsh-store-"));
    temporary.push(root);
    const store = new DshSessionStore(path.join(root, "ledger.json"));
    await store.load();
    const session = store.create({ presetId: "flash", presetFingerprint: "a".repeat(64), workspaceId: "fixture" });
    store.startRun(session, "Inspect the repository");
    store.applyBridge({
      type: "notification", sessionId: session.id,
      notification: { method: "session.event", payload: { event: { type: "assistant/chunk", data: { text: "Working" } } } },
    });
    store.applyBridge({
      type: "notification", sessionId: session.id,
      notification: { method: "session.event", payload: { event: { type: "assistant/message", data: { message: { content: [{ type: "text", text: "Finished safely" }] } } } } },
    });
    store.applyBridge({ type: "finished", sessionId: session.id, finalResponse: "Finished safely", finishReason: "completed" });
    expect(session.events.map((event) => event.kind)).toEqual(["user", "agent"]);
    expect(session.events[1]).toMatchObject({ kind: "agent", text: "Finished safely" });
    expect(session.running).toBe(false);
    await store.flush();
  });

  it("persists only bounded experiment metadata, not prompt or output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dsh-ledger-"));
    temporary.push(root);
    const ledger = path.join(root, "ledger.json");
    const store = new DshSessionStore(ledger);
    await store.load();
    const session = store.create({ presetId: "flash", presetFingerprint: "a".repeat(64), workspaceId: "fixture" });
    store.startRun(session, "SECRET PROMPT CONTENT");
    store.applyBridge({ type: "finished", sessionId: session.id, finalResponse: "SECRET MODEL OUTPUT", finishReason: "completed" });
    await store.flush();
    await vi.waitFor(async () => expect(await readFile(ledger, "utf8")).toContain('"outcome": "completed"'));
    const content = await readFile(ledger, "utf8");
    expect(content).not.toContain("SECRET PROMPT CONTENT");
    expect(content).not.toContain("SECRET MODEL OUTPUT");
    expect(content).toContain('"taskClass": "conversation"');
    expect(content).toContain(`"presetFingerprint": "${"a".repeat(64)}"`);
  });

  it("settles running sessions when their bridge exits and ignores stale completion", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dsh-exit-"));
    temporary.push(root);
    const store = new DshSessionStore(path.join(root, "ledger.json"));
    await store.load();
    const session = store.create({ presetId: "flash", presetFingerprint: "a".repeat(64), workspaceId: "fixture" });
    store.startRun(session, "Inspect");
    store.failRunning("flash", "fixture");
    expect(session.running).toBe(false);
    expect(session.events.at(-1)).toMatchObject({ kind: "error", message: "DSH bridge stopped during the run" });
    store.applyBridge({ type: "finished", sessionId: session.id, finalResponse: "stale", finishReason: "completed" });
    expect(session.events.some((event) => event.kind === "agent" && event.text === "stale")).toBe(false);
    await store.flush();
  });
});
