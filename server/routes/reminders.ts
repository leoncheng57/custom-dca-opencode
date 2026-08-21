import { Router } from "express";

import { reminderCatalogue } from "../reminders/loader.js";

export function reminderRoutes(): Router {
  const router = Router();
  router.get("/reminders", (_req, res) => {
    res.json({
      reminders: reminderCatalogue().map(({ id, description, triggers }) => ({
        id,
        description,
        triggers,
      })),
    });
  });
  return router;
}
