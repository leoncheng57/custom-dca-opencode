import { Router, type Response } from "express";

import { PathError } from "../paths.js";
import { discoverProjects, ProjectPinStore } from "../projects.js";

function errorResponse(res: Response, error: unknown): void {
  const status = error instanceof PathError ? error.status : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
}

export function projectRoutes(store = new ProjectPinStore()): Router {
  const router = Router();
  router.get("/projects", async (_req, res) => {
    try {
      res.json(await discoverProjects({ root: store.root }));
    } catch (error) {
      errorResponse(res, error);
    }
  });
  router.get("/project-pins", async (_req, res) => {
    try {
      res.json({ directories: await store.read() });
    } catch (error) {
      errorResponse(res, error);
    }
  });
  router.patch("/project-pins", async (req, res) => {
    try {
      res.json({ directories: await store.write(req.body) });
    } catch (error) {
      errorResponse(res, error);
    }
  });
  return router;
}
