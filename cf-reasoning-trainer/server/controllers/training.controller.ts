import { Router } from "express";
import { z } from "zod";
import { dayOverrideInput, goalInput, trainingEvent } from "../../shared/training";
import { asyncHandler } from "../http";
import { requireAuth } from "../middlewares/security";
import type { createTrainingService } from "../training/service";

export function trainingRouter(service: ReturnType<typeof createTrainingService>) {
  const router = Router();
  router.use(requireAuth);
  router.get("/overview", asyncHandler(async (req, res) => { res.json(await service.overview(req.user!.id)); }));
  router.put("/goal", asyncHandler(async (req, res) => { res.json(await service.setGoal(req.user!.id, goalInput.parse(req.body))); }));
  router.put("/day", asyncHandler(async (req, res) => { res.json(await service.setDayOverride(req.user!.id, dayOverrideInput.parse(req.body))); }));
  router.post("/plan", asyncHandler(async (req, res) => { res.json(await service.planToday(req.user!.id)); }));
  router.post("/assignments/:id/event", asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    res.json(await service.event(req.user!.id, id, trainingEvent.parse(req.body)));
  }));
  router.get("/history", asyncHandler(async (req, res) => {
    const query = z.object({ beforeId: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    res.json(await service.history(req.user!.id, query.beforeId, query.limit));
  }));
  return router;
}
