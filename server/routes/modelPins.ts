import { Router } from "express";

import { ModelPinError, ModelPinStore } from "../modelPins.js";

export function modelPinRoutes(store = new ModelPinStore()): Router {
  const router = Router();
  router.get("/model-pins", async (_req, res) => {
    try {
      res.json({ models: await store.read() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.patch("/model-pins", async (req, res) => {
    try {
      res.json({ models: await store.write(req.body) });
    } catch (error) {
      res.status(error instanceof ModelPinError ? 400 : 500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  return router;
}
