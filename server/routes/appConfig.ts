import { Router } from "express";

import type { PtyMode } from "../ptyPolicy.js";

export interface AppConfigOptions {
  publicAppUrl: string | null;
  /**
   * Reported so the shell can decide whether a Terminal nav entry exists at
   * all. Only the mode is exposed — never the origin allowlist or the shell
   * path, which are operator configuration the browser has no use for.
   */
  ptyMode: PtyMode;
}

export function appConfigRoutes(options: AppConfigOptions): Router {
  const router = Router();
  router.get("/app-config", (_req, res) => {
    res.json({
      publicAppUrl: options.publicAppUrl,
      pty: { enabled: options.ptyMode !== "off", mode: options.ptyMode },
    });
  });
  return router;
}
