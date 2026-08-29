import { Router } from "express";

import { PathError, requireWorkspaceDirectory } from "../paths.js";
import { visibleReminders } from "../reminders/loader.js";

export function reminderRoutes(): Router {
  const router = Router();
  // Directory-scoped: a reminder may declare `scope_repository`, and those are
  // only listed for a directory whose git origin matches (issue #165). The
  // projection still withholds `body`; the scope filter is about which presets
  // are even acknowledged to exist.
  router.get("/reminders", (req, res) => {
    const raw = req.query.directory;
    // Absent directory means "general reminders only". Fail closed rather than
    // treating a missing scope as permission to reveal everything.
    const scoped = raw === undefined || raw === ""
      ? Promise.resolve(null)
      : requireWorkspaceDirectory(raw);
    scoped
      .then((directory) => (directory === null ? visibleReminders("") : visibleReminders(directory)))
      .then((reminders) => {
        res.json({
          reminders: reminders.map(({ id, title, description, triggers, tags, scopeRepository }) => ({
            id,
            title,
            description,
            triggers,
            tags,
            ...(scopeRepository ? { scopeRepository } : {}),
          })),
        });
      })
      .catch((error: unknown) => {
        const status = error instanceof PathError ? error.status : 500;
        res.status(status).json({ error: error instanceof Error ? error.message : "failed to load reminders" });
      });
  });
  return router;
}
