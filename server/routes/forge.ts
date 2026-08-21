import { Router } from "express";

import { getReviewDetails, getReviewStatus, mergeReview, parseReviewUrl } from "../forge.js";

export function forgeRoutes(): Router {
  const router = Router();
  router.get("/forge/review", (req, res) => {
    try {
      const ref = parseReviewUrl(String(req.query.url ?? ""));
      void getReviewStatus(ref)
        .then((review) => res.json({ review }))
        .catch((error: unknown) => res.status(502).json({ error: error instanceof Error ? error.message : String(error) }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.get("/forge/review/details", (req, res) => {
    try {
      const ref = parseReviewUrl(String(req.query.url ?? ""));
      void getReviewDetails(ref)
        .then((details) => res.json({ details }))
        .catch((error: unknown) => res.status(502).json({ error: error instanceof Error ? error.message : String(error) }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/forge/review/merge", (req, res) => {
    try {
      const ref = parseReviewUrl(String(req.body?.url ?? ""));
      void mergeReview(ref, String(req.body?.expectedSha ?? ""))
        .then(() => res.json({ merged: true }))
        .catch((error: unknown) => res.status(502).json({ error: error instanceof Error ? error.message : String(error) }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  return router;
}
