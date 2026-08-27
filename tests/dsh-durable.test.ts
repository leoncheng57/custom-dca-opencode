import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Context } from "@deepseek-ai/cordis";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";

import { DshDurableReader, detectDurable } from "../server/dsh/durable.js";
import { DshTrajectoryStore } from "../server/dsh/trajectory.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

/** Writes a log the way the harness would, so the reader is tested against real bytes. */
async function writeLog(compression: "zstd" | "none", id: string, seqs: number[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dca-durable-"));
  temporary.push(root);
  const ctx = new Context();
  ctx.provide("sessions", { list: () => [] });
  ctx.provide("logger", { warn() {}, info() {}, debug() {} });
  const backend = new JsonlSessionPersistence(ctx, { root, compression }) as unknown as {
    create(meta: unknown): Promise<void>;
    append(id: string, events: unknown[]): Promise<void>;
  };
  await backend.create({ id, version: 0, cwd: root, createdAt: 1_700_000_000_000 });
  if (seqs.length > 0) {
    await backend.append(id, seqs.map((seq) => ({
      seq, type: "session/probe", ignorable: true, time: 1_700_000_000_000 + seq, data: { n: seq },
    })));
  }
  return { root, backend };
}

describe("DSH durable session reader", () => {
  it("detects the on-disk encoding from the artifact rather than assuming it", async () => {
    for (const compression of ["zstd", "none"] as const) {
      const { root } = await writeLog(compression, "detect-me", [0]);
      expect(detectDurable(root)).toEqual({ available: true, root, compression });
    }
  });

  it("names the absence instead of pretending persistence exists", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "dca-durable-empty-"));
    temporary.push(empty);
    expect(detectDurable(undefined)).toEqual({ available: false, reason: "no-root" });
    expect(detectDurable(path.join(empty, "missing"))).toEqual({ available: false, reason: "no-root" });
    expect(detectDurable(empty)).toEqual({ available: false, reason: "no-artifacts" });
  });

  it("folds only the tail past a watermark and reports nothing new as an empty read", async () => {
    const { root, backend } = await writeLog("zstd", "tail", [0, 1, 2]);
    const reader = new DshDurableReader(root);
    expect(reader.enabled).toBe(true);
    expect((await reader.readFrom("tail", 0))?.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect((await reader.readFrom("tail", 2))?.map((event) => event.seq)).toEqual([2]);
    // Past the end is an empty read, never an error: a caught-up projection
    // must be distinguishable from a broken one.
    expect(await reader.readFrom("tail", 99)).toEqual([]);

    const before = await reader.revision("tail");
    expect(before).toBeTruthy();
    await backend.append("tail", [{ seq: 3, type: "session/probe", ignorable: true, time: 1, data: {} }]);
    expect(await reader.revision("tail")).not.toBe(before);
    expect((await reader.readFrom("tail", 3))?.map((event) => event.seq)).toEqual([3]);
  });

  it("returns undefined rather than an empty trajectory when the log cannot answer", async () => {
    const { root } = await writeLog("zstd", "present", [0]);
    const reader = new DshDurableReader(root);
    // An unknown session must not read as "complete and empty".
    expect(await reader.readFrom("never-persisted", 0)).toBeUndefined();

    const disabled = new DshDurableReader(undefined);
    expect(disabled.enabled).toBe(false);
    expect(await disabled.readFrom("present", 0)).toBeUndefined();
    expect(await disabled.revision("present")).toBeUndefined();
  });

  it("serves a complete trajectory from the durable log and keeps DCA lifecycle records", async () => {
    const { root } = await writeLog("zstd", "dsh-merged", [0, 1, 2]);
    const projection = await mkdtemp(path.join(os.tmpdir(), "dca-projection-"));
    temporary.push(projection);
    const store = new DshTrajectoryStore(projection, {
      sensitiveEnabled: true,
      durable: new DshDurableReader(root),
    });
    // A failure DSH never saw: it exists only in DCA's capture.
    await store.appendLifecycle("dsh-merged", "dca/prompt-rejected", { cause: "bridge refused" });
    await store.flush("dsh-merged");

    const page = await store.page("dsh-merged");
    expect(page.coverage.source).toBe("dsh-durable-persistence");
    expect(page.coverage.complete).toBe(true);
    expect(page.coverage.mayContainGaps).toBe(false);
    expect(page.events.filter((event) => event.source === "dsh-native-notification")).toHaveLength(3);
    expect(page.events.some((event) => event.type === "dca/prompt-rejected")).toBe(true);

    const exported = await store.export("dsh-merged");
    expect(exported.coverage.complete).toBe(true);
    // Ids are derived from the immutable log, so repeated reads are stable.
    expect((await store.export("dsh-merged")).events.map((event) => event.id)).toEqual(exported.events.map((event) => event.id));
  });

  it("falls back to the bounded capture, still saying so, when nothing is persisted", async () => {
    const projection = await mkdtemp(path.join(os.tmpdir(), "dca-projection-"));
    const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "dca-empty-root-"));
    temporary.push(projection, emptyRoot);
    const store = new DshTrajectoryStore(projection, {
      sensitiveEnabled: true,
      durable: new DshDurableReader(emptyRoot),
    });
    await store.appendLifecycle("dsh-solo", "dca/session-created", {});
    await store.flush("dsh-solo");
    const page = await store.page("dsh-solo");
    expect(page.coverage.source).toBe("dca-captured-projection");
    expect(page.coverage.complete).toBe(false);
    expect(page.coverage.mayContainGaps).toBe(true);
  });

  it("never exposes the mutating recovery methods to a read model", async () => {
    const { root } = await writeLog("zstd", "guard", [0]);
    const reader = new DshDurableReader(root) as unknown as Record<string, unknown>;
    // load/prepare durably rewrite the harness's own log.
    for (const forbidden of ["load", "prepare", "append", "create"]) {
      expect(typeof reader[forbidden]).toBe("undefined");
    }
  });
});
