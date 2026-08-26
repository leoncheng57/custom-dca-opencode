import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import type { DshBridgePool } from "../server/dsh/bridge.js";
import type { DshConfig } from "../server/dsh/config.js";
import { DshSessionStore } from "../server/dsh/store.js";
import { DshTrajectoryStore } from "../server/dsh/trajectory.js";
import { dshRoutes } from "../server/routes/dsh.js";

const temporary: string[] = [];
const servers: Array<ReturnType<ReturnType<typeof express>["listen"]>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(input: { sensitive: boolean; full: boolean }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dsh-trajectory-routes-"));
  temporary.push(root);
  const store = new DshSessionStore(path.join(root, "ledger.json"));
  const session = store.create({ presetId: "preset", presetFingerprint: "0".repeat(64), workspaceId: "workspace" });
  const trajectory = new DshTrajectoryStore(path.join(root, "trajectory"), { sensitiveEnabled: input.sensitive });
  await trajectory.appendBridge({
    type: "notification",
    sessionId: session.id,
    notification: { method: "session.event", payload: { sessionId: session.id, event: { type: "user/message", seq: 0, time: 1_700_000_000_000, data: { content: "PRIVATE PROMPT", source: { kind: "user" } }, surfaceOp: "append" } } },
  });
  const eventId = (await trajectory.export(session.id)).events[0].id;
  const config: DshConfig = {
    enabled: true,
    configured: true,
    python: process.execPath,
    bridgeScript: "unused",
    sessionRoot: path.join(root, "sessions"),
    ledgerFile: path.join(root, "ledger.json"),
    trajectoryRoot: path.join(root, "trajectory"),
    trajectorySensitiveEnabled: input.sensitive,
    trajectoryFullExportEnabled: input.full,
    sdkVersion: "0.1.1rc2",
    sandbox: "test-unsafe",
    presets: [],
    workspaces: [],
    errors: [],
  };
  const pool = new EventEmitter();
  const app = express();
  app.use(express.json());
  app.use("/api", dshRoutes(config, pool as DshBridgePool, store, trajectory));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}/api/dsh/sessions/${session.id}/trajectory`, session, eventId, pool, store };
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("DSH trajectory route privacy", () => {
  it("serves safe summaries while sensitive detail and full export remain disabled", async () => {
    const { base } = await setup({ sensitive: false, full: false });
    const listed = await fetch(base);
    expect(listed.status).toBe(200);
    expectPrivate(listed);
    expect(JSON.stringify(await listed.json())).not.toContain("PRIVATE PROMPT");

    const detail = await fetch(`${base}/dsh-test:0/detail`, { method: "POST" });
    expect(detail.status).toBe(403);
    expectPrivate(detail);
    expect(await detail.json()).toEqual({ error: "Sensitive trajectory detail is disabled" });

    const full = await fetch(`${base}/export-full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "export-sensitive-dsh-trajectory" }) });
    expect(full.status).toBe(403);
    expectPrivate(full);
  });

  it("requires one-event POST reveal and a separate full-export confirmation", async () => {
    const { base, eventId } = await setup({ sensitive: true, full: true });
    expect((await fetch(`${base}/${encodeURIComponent(eventId)}/detail`)).status).toBe(404);

    const detail = await fetch(`${base}/${encodeURIComponent(eventId)}/detail`, { method: "POST" });
    expect(detail.status).toBe(200);
    expectPrivate(detail);
    expect(JSON.stringify(await detail.json())).toContain("PRIVATE PROMPT");

    const unconfirmed = await fetch(`${base}/export-full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(unconfirmed.status).toBe(400);
    expectPrivate(unconfirmed);

    const confirmed = await fetch(`${base}/export-full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "export-sensitive-dsh-trajectory" }) });
    expect(confirmed.status).toBe(200);
    expectPrivate(confirmed);
    expect(JSON.stringify(await confirmed.json())).toContain("PRIVATE PROMPT");
  });

  it("rejects a bridge binding mismatch before it can mutate the main transcript", async () => {
    const { pool, session, store } = await setup({ sensitive: false, full: false });
    store.startRun(session, "keep running");
    pool.emit("notification", { type: "finished", sessionId: session.id, finalResponse: "injected", finishReason: "completed", bridgePresetId: "other", bridgeWorkspaceId: session.workspaceId });
    expect(session.running).toBe(true);
    expect(session.events.some((event) => event.kind === "agent" && event.text === "injected")).toBe(false);
    await store.flush();
  });
});
