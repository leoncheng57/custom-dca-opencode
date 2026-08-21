import { Router, type Response } from "express";

import { OpencodeError, type OpencodeConfig } from "../opencode/client.js";
import {
  listChanges,
  listCommits,
  listWorkspace,
  readWorkspaceFile,
} from "../opencode/workspace.js";
import { PathError, requireReadableWorkspacePath, requireRelativePath, requireWorkspaceDirectory } from "../paths.js";

function fail(res: Response, error: unknown): void {
  if (error instanceof PathError) res.status(error.status).json({ error: error.message });
  else if (error instanceof OpencodeError) res.status(502).json({ error: error.message });
  else res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
}

export function workspaceRoutes(config: OpencodeConfig): Router {
  const router = Router();
  router.get("/workspace/tree", (req, res) => {
    requireWorkspaceDirectory(req.query.directory)
      .then(async (directory) => {
        const relative = requireRelativePath(req.query.path);
        const safeRelative = await requireReadableWorkspacePath(directory, relative);
        return listWorkspace(config, directory, safeRelative);
      })
      .then((tree) => res.json(tree))
      .catch((error: unknown) => fail(res, error));
  });
  router.get("/workspace/file", (req, res) => {
    requireWorkspaceDirectory(req.query.directory)
      .then(async (directory) => {
        const relative = requireRelativePath(req.query.path);
        if (!relative) throw new PathError(400, "'path' is required");
        const safeRelative = await requireReadableWorkspacePath(directory, relative);
        return readWorkspaceFile(config, directory, safeRelative);
      })
      .then((file) => res.json(file))
      .catch((error: unknown) => fail(res, error));
  });
  router.get("/workspace/changes", (req, res) => {
    const mode = req.query.mode === "branch" ? "branch" : "git";
    const rawContext = Number(req.query.context ?? 3);
    const context = Number.isFinite(rawContext) ? Math.max(0, Math.min(20, Math.trunc(rawContext))) : 3;
    requireWorkspaceDirectory(req.query.directory)
      .then((directory) => listChanges(config, directory, mode, context))
      .then((changes) => res.json({ changes }))
      .catch((error: unknown) => fail(res, error));
  });
  router.get("/workspace/commits", (req, res) => {
    requireWorkspaceDirectory(req.query.directory)
      .then((directory) => listCommits(directory, Number(req.query.limit ?? 50)))
      .then((commits) => res.json({ commits }))
      .catch((error: unknown) => fail(res, error));
  });
  return router;
}
