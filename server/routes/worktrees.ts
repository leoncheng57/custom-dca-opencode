import { Router, type Response } from "express";

import { type OpencodeConfig } from "../opencode/client.js";
import type { EventBus } from "../opencode/events.js";
import {
  createWorktree,
  deleteWorktree,
  listWorktrees,
  resetWorktree,
} from "../opencode/worktrees.js";
import { PathError, requireProjectDirectory } from "../paths.js";

function fail(res: Response, error: unknown): void {
  if (error instanceof PathError) res.status(error.status).json({ error: error.message });
  else res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
}

function target(body: unknown): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).worktreeDirectory : undefined;
  if (typeof value !== "string" || !value) throw new PathError(400, "'worktreeDirectory' is required");
  return value;
}

export function worktreeRoutes(config: OpencodeConfig, bus: EventBus): Router {
  const router = Router();
  router.get("/worktrees", (req, res) => {
    requireProjectDirectory(req.query.directory)
      .then((directory) => listWorktrees(config, directory))
      .then((worktrees) => res.json({ worktrees }))
      .catch((error: unknown) => fail(res, error));
  });
  router.post("/worktrees", (req, res) => {
    requireProjectDirectory(req.query.directory)
      .then((directory) => createWorktree(config, bus, directory, typeof req.body?.name === "string" ? req.body.name : undefined))
      .then((worktree) => res.status(201).json({ worktree }))
      .catch((error: unknown) => fail(res, error));
  });
  router.post("/worktrees/reset", (req, res) => {
    requireProjectDirectory(req.query.directory)
      .then((directory) => resetWorktree(config, directory, target(req.body)))
      .then(() => res.json({ reset: true }))
      .catch((error: unknown) => fail(res, error));
  });
  router.delete("/worktrees", (req, res) => {
    requireProjectDirectory(req.query.directory)
      .then((directory) => deleteWorktree(config, directory, target(req.body)))
      .then(() => res.status(204).end())
      .catch((error: unknown) => fail(res, error));
  });
  return router;
}
