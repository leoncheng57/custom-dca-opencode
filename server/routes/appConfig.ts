import { Router } from "express";

export function appConfigRoutes(publicAppUrl: string | null): Router {
  const router = Router();
  router.get("/app-config", (_req, res) => {
    res.json({ publicAppUrl });
  });
  return router;
}
