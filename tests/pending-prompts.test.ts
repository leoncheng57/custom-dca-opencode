import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PendingPromptDispatcher, type SessionObservation } from "../server/pending-prompts/dispatcher.js";
import {
  PendingPromptGuardError,
  PendingPromptLimitError,
  PendingPromptStore,
} from "../server/pending-prompts/store.js";

const directories: string[] = [];
const project = "/project";
const sessionID = "session";
const prompt = (text: string) => ({ text, mode: "build" as const });
const enqueue = (pendingStore: PendingPromptStore, text: string, key = `browser-${text}`) =>
  pendingStore.add(project, sessionID, key, prompt(text));

async function store(limits?: { items: number; bytes: number }): Promise<PendingPromptStore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pending-prompts-"));
  directories.push(directory);
  return new PendingPromptStore(path.join(directory, "state.json"), limits);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function controlledDispatcher(
  pendingStore: PendingPromptStore,
  initial: SessionObservation = "idle",
  send = vi.fn(async () => undefined),
) {
  let observation = initial;
  const dispatcher = new PendingPromptDispatcher(pendingStore, {
    observe: vi.fn(async () => observation),
    send,
  });
  return { dispatcher, send, setObservation: (next: SessionObservation) => { observation = next; } };
}

describe("pending prompt dispatcher", () => {
  it("dispatches FIFO and waits for a busy then idle lifecycle", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "first");
    await enqueue(pendingStore, "second");
    const control = controlledDispatcher(pendingStore);

    await control.dispatcher.reconcile(project, sessionID);
    await control.dispatcher.reconcile(project, sessionID);
    expect(control.send.mock.calls.map((call) => call[2].text)).toEqual(["first"]);

    control.setObservation("busy");
    await control.dispatcher.reconcile(project, sessionID);
    control.setObservation("idle");
    await control.dispatcher.reconcile(project, sessionID);
    await control.dispatcher.reconcile(project, sessionID);
    expect(control.send.mock.calls.map((call) => call[2].text)).toEqual(["first", "second"]);
  });

  it("reconciles a completed transcript when the busy status transition was missed", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "short first");
    await enqueue(pendingStore, "short second");
    const control = controlledDispatcher(pendingStore);
    await control.dispatcher.reconcile(project, sessionID);
    control.setObservation("completed");
    await control.dispatcher.reconcile(project, sessionID);
    await control.dispatcher.reconcile(project, sessionID);
    expect(control.send.mock.calls.map((call) => call[2].text)).toEqual(["short first", "short second"]);
  });

  it("deduplicates a browser idempotency key", async () => {
    const pendingStore = await store();
    const first = await enqueue(pendingStore, "same", "browser-retry-key");
    const second = await enqueue(pendingStore, "changed payload ignored", "browser-retry-key");
    expect(second.id).toBe(first.id);
    expect((await pendingStore.get(project, sessionID)).items).toHaveLength(1);
  });

  it("starts only one scheduler and prevents concurrent dispatch", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "once");
    const callbacks: Array<() => void> = [];
    const send = vi.fn(async () => undefined);
    const dispatcher = new PendingPromptDispatcher(pendingStore, {
      observe: async () => "idle",
      send,
      schedule: (callback) => { callbacks.push(callback); return () => undefined; },
    });
    await dispatcher.start();
    await dispatcher.start();
    await Promise.all([
      dispatcher.reconcile(project, sessionID),
      dispatcher.reconcile(project, sessionID),
    ]);
    expect(callbacks).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    dispatcher.stop();
  });

  it.each(["busy", "retry"] as const)("blocks dispatch while status is %s", async (status) => {
    const pendingStore = await store();
    await enqueue(pendingStore, status);
    const control = controlledDispatcher(pendingStore, status);
    await control.dispatcher.reconcile(project, sessionID);
    expect(control.send).not.toHaveBeenCalled();
  });

  it("recovers a missed event on the scheduled poll", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "poll me");
    let observation: SessionObservation = "busy";
    let tick!: () => void;
    const send = vi.fn(async () => undefined);
    const dispatcher = new PendingPromptDispatcher(pendingStore, {
      observe: async () => observation,
      send,
      schedule: (callback) => { tick = callback; return () => undefined; },
    });
    await dispatcher.start();
    observation = "idle";
    tick();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    dispatcher.stop();
  });

  it("pauses on stop and resumes explicitly", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "later");
    const control = controlledDispatcher(pendingStore);
    await control.dispatcher.pause(project, sessionID, "stopped");
    await control.dispatcher.reconcile(project, sessionID);
    expect(control.send).not.toHaveBeenCalled();
    await control.dispatcher.resume(project, sessionID);
    expect(control.send).toHaveBeenCalledTimes(1);
  });

  it("pauses interrupted sessions", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "unsafe after crash");
    const control = controlledDispatcher(pendingStore, "interrupted");
    await control.dispatcher.reconcile(project, sessionID);
    const state = await pendingStore.get(project, sessionID);
    expect(state).toMatchObject({ paused: true, pauseReason: "interrupted" });
    expect(control.send).not.toHaveBeenCalled();
  });

  it("marks an async send error uncertain and pauses", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "fails");
    const control = controlledDispatcher(pendingStore, "idle", vi.fn(async () => { throw new Error("upstream down"); }));
    await control.dispatcher.reconcile(project, sessionID);
    const state = await pendingStore.get(project, sessionID);
    expect(state).toMatchObject({ paused: true, pauseReason: "uncertain" });
    expect(state.items[0]).toMatchObject({ status: "uncertain", lastError: "upstream down" });
  });

  it("turns an in-flight restart into uncertain paused state", async () => {
    const firstStore = await store();
    await enqueue(firstStore, "maybe accepted");
    const control = controlledDispatcher(firstStore);
    await control.dispatcher.reconcile(project, sessionID);

    const restarted = new PendingPromptStore(firstStore.file);
    const state = await restarted.get(project, sessionID);
    expect(state).toMatchObject({ paused: true, pauseReason: "uncertain", phase: "ready" });
    expect(state.items[0].status).toBe("uncertain");
    await expect(restarted.edit(project, sessionID, state.items[0].id, "changed")).rejects.toBeInstanceOf(PendingPromptGuardError);
    await expect(restarted.remove(project, sessionID, state.items[0].id)).rejects.toBeInstanceOf(PendingPromptGuardError);
    const resumed = controlledDispatcher(restarted);
    await expect(resumed.dispatcher.resume(project, sessionID)).rejects.toBeInstanceOf(PendingPromptGuardError);
    expect(resumed.send).not.toHaveBeenCalled();
  });

  it("Steer now requires busy and removes the queued item after acceptance", async () => {
    const pendingStore = await store();
    const item = await enqueue(pendingStore, "steer me");
    const control = controlledDispatcher(pendingStore, "idle");
    await expect(control.dispatcher.steer(project, sessionID, item.id)).rejects.toBeInstanceOf(PendingPromptGuardError);
    control.setObservation("busy");
    await control.dispatcher.steer(project, sessionID, item.id);
    expect(control.send).toHaveBeenCalledTimes(1);
    expect((await pendingStore.get(project, sessionID)).items).toEqual([]);
  });
});

describe("pending prompt store", () => {
  it("persists atomically with owner-only permissions", async () => {
    const pendingStore = await store();
    await enqueue(pendingStore, "private");
    expect((await stat(pendingStore.file)).mode & 0o777).toBe(0o600);
  });

  it("guards edits and removals once dispatch starts", async () => {
    const pendingStore = await store();
    const item = await enqueue(pendingStore, "locked");
    const control = controlledDispatcher(pendingStore);
    await control.dispatcher.reconcile(project, sessionID);
    await expect(pendingStore.edit(project, sessionID, item.id, "changed")).rejects.toBeInstanceOf(PendingPromptGuardError);
    await expect(pendingStore.remove(project, sessionID, item.id)).rejects.toBeInstanceOf(PendingPromptGuardError);
  });

  it("enforces item and total byte caps", async () => {
    const itemLimited = await store({ items: 1, bytes: 1_000 });
    await enqueue(itemLimited, "one");
    await expect(enqueue(itemLimited, "two")).rejects.toBeInstanceOf(PendingPromptLimitError);

    const byteLimited = await store({ items: 10, bytes: 50 });
    await expect(enqueue(byteLimited, "x".repeat(100))).rejects.toBeInstanceOf(PendingPromptLimitError);
  });
});
