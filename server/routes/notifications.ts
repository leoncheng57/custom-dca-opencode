import { Router } from "express";

import { sendNtfy } from "../notifications/ntfy.js";
import { HistoryStore } from "../notifications/history.js";
import { NOTIFY_EVENTS, PreferenceStore, type NotifyEvent } from "../notifications/preferences.js";

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function queryKind(value: unknown): NotifyEvent | undefined {
  const candidate = queryString(value);
  return candidate && (NOTIFY_EVENTS as readonly string[]).includes(candidate)
    ? (candidate as NotifyEvent)
    : undefined;
}

function queryState(value: unknown): "all" | "active" | "resolved" {
  const candidate = queryString(value);
  return candidate === "active" || candidate === "resolved" ? candidate : "all";
}

export function notificationRoutes(
  store: PreferenceStore,
  history: HistoryStore,
  /** Injected so a history read can close records answered while we were down. */
  reconcile: () => Promise<void> = async () => {},
): Router {
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

  router.get("/notifications/history", (req, res) => {
    // Throttled upstream, so polling this route cannot stampede OpenCode.
    reconcile()
      .then(async () => {
        const limitParam = Number(queryString(req.query.limit));
        const directory = queryString(req.query.directory);
        const kind = queryKind(req.query.kind);
        const [records, activeCount] = await Promise.all([
          history.list({
            ...(Number.isFinite(limitParam) ? { limit: limitParam } : {}),
            ...(kind ? { kind } : {}),
            // History remains global; directory scopes only the nav/header
            // counter returned alongside it.
            state: queryState(req.query.state),
          }),
          history.activeCount(directory),
        ]);
        res.json({ records, activeCount });
      })
      .catch((error: unknown) =>
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) }),
      );
  });

  router.post("/notifications/:id/dismiss", (req, res) => {
    const id = req.params.id;
    history
      .find(id)
      .then(async (record) => {
        if (!record) {
          res.status(404).json({ error: "notification not found" });
          return;
        }
        await history.resolve((candidate) => candidate.id === id, "dismissed");
        res.json({ dismissed: true, activeCount: await history.activeCount() });
      })
      .catch((error: unknown) =>
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) }),
      );
  });

  return router;
}
