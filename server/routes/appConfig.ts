import { Router } from "express";

export function appConfigRoutes(publicAppUrl: string | null, dshEnabled = false): Router {
  const router = Router();
  router.get("/app-config", (_req, res) => {
    res.json({ publicAppUrl, dshEnabled });
  });
  return router;
}
