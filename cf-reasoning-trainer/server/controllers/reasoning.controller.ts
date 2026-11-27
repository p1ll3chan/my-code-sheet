import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http";
import { requireAuth } from "../middlewares/security";
import type { createReasoningService } from "../reasoning/service";
import type { createCoverageService } from "../reasoning/coverage";

export function reasoningRouter(service: ReturnType<typeof createReasoningService>, coverage: ReturnType<typeof createCoverageService>) {
  const router = Router();
  router.use(requireAuth);
  router.get("/coverage", asyncHandler(async (_req, res) => { res.json(await coverage.summary()); }));
  router.get("/problems/:key", asyncHandler(async (req, res) => {
    const key = z.string().min(1).max(128).parse(req.params.key);
    const result = await service.byProblem(key);
    if (!result) { res.status(404).json({ message: "Reviewed reasoning unavailable" }); return; }
    res.json(result);
  }));
  router.get("/concepts/:id/problems", asyncHandler(async (req, res) => {
    const id = z.string().min(1).max(128).parse(req.params.id);
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
    res.json({ conceptId: id, problemKeys: await service.byConcept(id, limit) });
  }));
  return router;
}
