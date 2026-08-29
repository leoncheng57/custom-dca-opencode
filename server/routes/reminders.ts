import { Router } from "express";

import { reminderCatalogue } from "../reminders/loader.js";

export function reminderRoutes(): Router {
  const router = Router();
  router.get("/reminders", (_req, res) => {
    res.json({
      reminders: reminderCatalogue().map(({ id, title, description, triggers, tags }) => ({
        id,
        title,
        description,
        triggers,
        tags,
      })),
    });
  });
  return router;
}
