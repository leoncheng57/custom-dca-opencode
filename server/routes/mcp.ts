import { Router } from "express";

import { OpencodeError, type OpencodeConfig } from "../opencode/client.js";
import { listMcp, setMcpConnected } from "../opencode/mcp.js";
import { PathError, requireWorkspaceDirectory } from "../paths.js";
import { getEffectivePermissions } from "../opencode/config.js";
import { request } from "../opencode/client.js";

export function mcpRoutes(config: OpencodeConfig): Router {
  const router = Router();

  const fail = (res: import("express").Response, error: unknown) => {
    if (error instanceof PathError) res.status(error.status).json({ error: error.message });
    else if (error instanceof OpencodeError && error.status === 404) res.status(404).json({ error: "MCP server not found" });
    else res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  };

  router.get("/mcp", (req, res) => {
    requireWorkspaceDirectory(req.query.directory)
      .then((directory) => listMcp(config, directory))
      .then((servers) => res.json({ servers }))
      .catch((error: unknown) => fail(res, error));
  });
  router.post("/mcp/:name/:action", (req, res) => {
    const name = typeof req.params.name === "string" ? req.params.name : "";
    const action = req.params.action;
    if (!name || (action !== "connect" && action !== "disconnect")) {
      res.status(400).json({ error: "invalid MCP operation" });
      return;
    }
    requireWorkspaceDirectory(req.query.directory)
      .then((directory) => setMcpConnected(config, directory, name, action === "connect"))
      .then((servers) => res.json({ servers }))
      .catch((error: unknown) => fail(res, error));
  });
  router.get("/permissions", (req, res) => {
    requireWorkspaceDirectory(req.query.directory)
      .then((directory) => getEffectivePermissions(config, directory))
      .then((permissions) => res.json({ permissions }))
      .catch((error: unknown) => fail(res, error));
  });
  router.get("/lsp", (req, res) => {
    requireWorkspaceDirectory(req.query.directory)
      .then((directory) => request<unknown>(config, "/lsp", { directory }))
      .then((servers) => res.json({ servers }))
      .catch((error: unknown) => fail(res, error));
  });
  return router;
}
