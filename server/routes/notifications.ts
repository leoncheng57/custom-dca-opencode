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

/**
 * Absent means "do not filter". The noise filters are a UI preference, so the
 * default has to be the unfiltered log: an omitted flag must never hide a
 * record from a caller that did not ask.
 */
function queryFlag(value: unknown): boolean {
  const candidate = queryString(value);
  return candidate === "1" || candidate === "true";
}

export function notificationRoutes(
  store: PreferenceStore,
  history: HistoryStore,
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
    Promise.resolve()
      .then(async () => {
        const limitParam = Number(queryString(req.query.limit));
        const directory = queryString(req.query.directory);
        const kind = queryKind(req.query.kind);
        // Applied to the rows and the counter together: a badge that counts
        // records the caller asked not to see just relocates the clutter.
        const filters = {
          hideAutoApproved: queryFlag(req.query.hideAutoApproved),
          hideSubagent: queryFlag(req.query.hideSubagent),
        };
        const [records, activeCount, suppressedActive] = await Promise.all([
          history.list({
            ...(Number.isFinite(limitParam) ? { limit: limitParam } : {}),
            ...(kind ? { kind } : {}),
            // History remains global; directory scopes only the nav/header
            // counter returned alongside it.
            state: queryState(req.query.state),
            ...filters,
          }),
          history.activeCount(directory, filters),
          history.suppressedActiveCounts(directory),
        ]);
        res.json({ records, activeCount, suppressedActive });
      })
      .catch((error: unknown) =>
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) }),
      );
  });

  router.patch("/notifications/:id", (req, res) => {
    if (typeof req.body?.resolved !== "boolean" || Object.keys(req.body).some((key) => key !== "resolved")) {
      res.status(400).json({ error: "body must contain only a boolean 'resolved' field" });
      return;
    }
    history
      .setResolved(req.params.id, req.body.resolved)
      .then(async (record) => {
        if (!record) {
          res.status(404).json({ error: "notification not found" });
          return;
        }
        res.json({ record, activeCount: await history.activeCount() });
      })
      .catch((error: unknown) =>
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) }),
      );
  });

  // Kept for the already-deployed v1 client; dismiss is a user action and maps
  // to the same persisted checked state.
  router.post("/notifications/:id/dismiss", (req, res) => {
    const id = req.params.id;
    history
      .find(id)
      .then(async (record) => {
        if (!record) {
          res.status(404).json({ error: "notification not found" });
          return;
        }
        await history.setResolved(id, true);
        res.json({ dismissed: true, activeCount: await history.activeCount() });
      })
      .catch((error: unknown) =>
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) }),
      );
  });

  return router;
}
