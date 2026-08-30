import { Router } from "express";

import { workflowCatalogue } from "../workflows/workflows.js";

export function workflowRoutes(): Router {
  const router = Router();
  // Unlike /api/reminders (which withholds bodies), the injector text is part
  // of the response on purpose: the workflow contract requires the trusted
  // content to be visible before submission. It stays trusted because the
  // prompt routes resolve it again by id — a browser-supplied body is never
  // accepted anywhere.
  //
  // The projection is explicit rather than a spread so a field added to a
  // preset is a deliberate contract change here. `argument` and `prompt` are
  // presentation for the field the browser renders and the fixed prompt it
  // shows; neither grants authority, because the injector is still resolved by
  // id at send time.
  router.get("/workflows", (_req, res) => {
    res.json({
      workflows: workflowCatalogue().map(({ id, title, description, injector, argument, prompt }) => ({
        id,
        title,
        description,
        injector,
        ...(argument ? { argument } : {}),
        ...(prompt ? { prompt } : {}),
      })),
    });
  });
  return router;
}
