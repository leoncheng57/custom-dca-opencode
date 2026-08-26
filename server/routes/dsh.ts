import { Router, type Response } from "express";
import { realpath } from "node:fs/promises";

import type { DshConfig, DshPreset, DshWorkspace } from "../dsh/config.js";
import { DshBridgePool } from "../dsh/bridge.js";
import { DshSessionStore } from "../dsh/store.js";

const MAX_PROMPT = 40_000;

function error(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function publicSession(session: ReturnType<DshSessionStore["create"]>) {
  return {
    id: session.id, title: session.title, presetId: session.presetId, workspaceId: session.workspaceId,
    createdAt: session.createdAt, updatedAt: session.updatedAt, running: session.running,
  };
}

export function dshRoutes(config: DshConfig, pool = new DshBridgePool(config), store = new DshSessionStore(config.ledgerFile)): Router {
  const router = Router();
  void store.load();
  pool.on("notification", (event) => store.applyBridge(event));
  pool.on("diagnostic", (detail) => console.warn("[dsh]", detail));
  store.on("error", (detail) => console.warn("[dsh-ledger]", detail));

  function requireEnabled(res: Response): boolean {
    if (!config.enabled) {
      error(res, 404, "DSH experiment is disabled");
      return false;
    }
    if (!config.configured) {
      error(res, 503, `DSH experiment is not configured: ${config.errors.join("; ")}`);
      return false;
    }
    return true;
  }
  function preset(id: unknown): DshPreset | undefined { return config.presets.find((item) => item.id === id); }
  function workspace(id: unknown): DshWorkspace | undefined { return config.workspaces.find((item) => item.id === id); }

  router.get("/dsh/config", (_req, res) => {
    if (!requireEnabled(res)) return;
    res.json({
      enabled: true,
      configured: config.configured,
      protocol: 1,
      readOnly: true,
      presets: config.presets.map(({ id, label, provider, model, fingerprint }) => ({ id, label, provider, model, fingerprint })),
      workspaces: config.workspaces.map(({ id, label }) => ({ id, label })),
    });
  });

  router.get("/dsh/sessions", (_req, res) => {
    if (!requireEnabled(res)) return;
    res.json({ sessions: store.list().map(publicSession) });
  });

  router.post("/dsh/sessions", async (req, res) => {
    if (!requireEnabled(res)) return;
    const selectedPreset = preset(req.body?.presetId);
    const selectedWorkspace = workspace(req.body?.workspaceId);
    if (!selectedPreset || !selectedWorkspace) return error(res, 400, "presetId and workspaceId must be allowlisted");
    try {
      await realpath(selectedWorkspace.directory);
      const session = store.create({ presetId: selectedPreset.id, workspaceId: selectedWorkspace.id, title: req.body?.title });
      res.status(201).json({ session: publicSession(session) });
    } catch {
      error(res, 400, "allowlisted DSH workspace is unavailable");
    }
  });

  router.get("/dsh/sessions/:id", (req, res) => {
    if (!requireEnabled(res)) return;
    const session = store.get(req.params.id);
    if (!session) return error(res, 404, "DSH session not found");
    res.json({ session: publicSession(session), events: session.events });
  });

  router.post("/dsh/sessions/:id/prompt", async (req, res) => {
    if (!requireEnabled(res)) return;
    const session = store.get(req.params.id);
    if (!session) return error(res, 404, "DSH session not found");
    if (session.running) return error(res, 409, "DSH session is already running");
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > MAX_PROMPT) return error(res, 400, `text must contain 1-${MAX_PROMPT} characters`);
    const selectedPreset = preset(session.presetId);
    const selectedWorkspace = workspace(session.workspaceId);
    if (!selectedPreset || !selectedWorkspace) return error(res, 409, "DSH session configuration is no longer allowlisted");
    store.startRun(session, text);
    try {
      await pool.get(selectedPreset, selectedWorkspace).request("prompt", { sessionId: session.id, text });
      res.status(202).json({ accepted: true });
    } catch (cause) {
      store.applyBridge({ type: "failed", sessionId: session.id, error: cause instanceof Error ? cause.message : String(cause) });
      error(res, 502, "DSH bridge rejected the prompt");
    }
  });

  router.post("/dsh/sessions/:id/cancel", async (req, res) => {
    if (!requireEnabled(res)) return;
    const session = store.get(req.params.id);
    if (!session) return error(res, 404, "DSH session not found");
    const selectedPreset = preset(session.presetId);
    const selectedWorkspace = workspace(session.workspaceId);
    if (!selectedPreset || !selectedWorkspace) return error(res, 409, "DSH session configuration is no longer allowlisted");
    try {
      const result = await pool.get(selectedPreset, selectedWorkspace).request("cancel", { sessionId: session.id }) as { cancelled?: boolean };
      if (result.cancelled) store.cancel(session);
      res.json({ cancelled: result.cancelled === true });
    } catch {
      error(res, 502, "DSH bridge cancellation failed");
    }
  });

  router.get("/dsh/events", (req, res) => {
    if (!requireEnabled(res)) return;
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    if (!store.get(sessionId)) return error(res, 404, "DSH session not found");
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ sessionId })}\n\n`);
    const update = (changed: string) => {
      if (changed === sessionId) res.write(`event: update\ndata: ${JSON.stringify({ sessionId })}\n\n`);
    };
    store.on("update", update);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      store.off("update", update);
    });
  });
  return router;
}
