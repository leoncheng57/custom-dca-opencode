import { Router } from "express";

import { sendNtfy } from "../notifications/ntfy.js";
import { PreferenceStore } from "../notifications/preferences.js";

export function notificationRoutes(store: PreferenceStore): Router {
  const router = Router();
  router.get("/notifications", (_req, res) => {
    store.read().then((preferences) =>
      res.json({ preferences, tokenConfigured: Boolean(process.env.NTFY_TOKEN) }),
    );
  });
  router.patch("/notifications", (req, res) => {
    store
      .write(req.body)
      .then((preferences) => res.json({ preferences, tokenConfigured: Boolean(process.env.NTFY_TOKEN) }))
      .catch((error: unknown) => res.status(400).json({ error: error instanceof Error ? error.message : String(error) }));
  });
  router.post("/notifications/test", (_req, res) => {
    store
      .read()
      .then((preferences) =>
        sendNtfy(preferences, { event: "idle", title: "OpenCode notification test", body: "Notifications are configured." }),
      )
      .then(() => res.json({ sent: true }))
      .catch((error: unknown) => res.status(502).json({ error: error instanceof Error ? error.message : String(error) }));
  });
  return router;
}
