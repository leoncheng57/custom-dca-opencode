import { Router } from "express";

import { type OpencodeConfig } from "../opencode/client.js";
import {
  getGlobalSettings,
  patchGlobalSettings,
  validateSettingsPatch,
} from "../opencode/config.js";

export function settingsRoutes(config: OpencodeConfig): Router {
  const router = Router();
  router.get("/settings", (_req, res) => {
    getGlobalSettings(config)
      .then((settings) => res.json({ settings }))
      .catch((error: unknown) => res.status(502).json({ error: String(error) }));
  });
  router.patch("/settings", (req, res) => {
    let patch;
    try {
      patch = validateSettingsPatch(req.body);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    patchGlobalSettings(config, patch)
      .then((settings) => res.json({ settings }))
      .catch((error: unknown) => res.status(502).json({ error: String(error) }));
  });
  return router;
}
