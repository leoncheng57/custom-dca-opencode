import { Router } from "express";

import { getPlanningSnapshot, planningErrorMessage } from "../github-planning.js";

/**
 * Read-only, and takes no parameters at all — not even ?directory=. The
 * repository is fixed in the service, so there is nothing here for a caller to
 * redirect. Adding a query parameter later would reintroduce that risk.
 */
export function planningRoutes(): Router {
  const router = Router();
  router.get("/planning/items", (req, res) => {
    void getPlanningSnapshot(req.query.refresh === "1")
      .then((snapshot) => res.json(snapshot))
      .catch((error: unknown) => res.status(502).json({ error: planningErrorMessage(error) }));
  });
  return router;
}
