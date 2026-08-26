import { Router } from "express";

import { workflowCatalogue } from "../workflows/workflows.js";

export function workflowRoutes(): Router {
  const router = Router();
  // Unlike /api/reminders (which withholds bodies), the injector text is part
  // of the response on purpose: the workflow contract requires the trusted
  // content to be visible before submission. It stays trusted because the
  // prompt routes resolve it again by id — a browser-supplied body is never
  // accepted anywhere.
  router.get("/workflows", (_req, res) => {
    res.json({
      workflows: workflowCatalogue().map(({ id, title, description, injector }) => ({
        id,
        title,
        description,
        injector,
      })),
    });
  });
  return router;
}
