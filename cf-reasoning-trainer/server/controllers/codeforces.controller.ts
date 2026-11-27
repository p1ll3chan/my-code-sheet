import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, HttpError } from "../http";
import { requireAuth } from "../middlewares/security";
import type { createCatalogService } from "../codeforces/catalog";
import type { createProfileService } from "../codeforces/profile";
import { CodeforcesError } from "../codeforces/client";
import { cfHandleSchema } from "../codeforces/types";

export function codeforcesRouter(catalog: ReturnType<typeof createCatalogService>, profiles: ReturnType<typeof createProfileService>) {
  const router = Router();
  router.use(requireAuth);
  const syncLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many sync requests; try again later" }, keyGenerator: req => String(req.user!.id) });
  router.get("/catalog", asyncHandler(async (req, res) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    await catalog.refresh().catch(() => undefined);
    const state = await catalog.summary();
    res.json({ ...state, problems: await catalog.list(query.limit, query.offset) });
  }));
  router.get("/profile", asyncHandler(async (req, res) => { res.json(await profiles.snapshot(req.user!.id)); }));
  router.get("/submissions", asyncHandler(async (req, res) => {
    const query = z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    res.json(await profiles.submissionsPage(req.user!.id, query.before, query.limit));
  }));
  router.post("/sync", syncLimiter, asyncHandler(async (req, res) => {
    const { handle } = z.object({ handle: cfHandleSchema }).strict().parse(req.body);
    try {
      await catalog.refresh().catch(() => undefined);
      res.json(await profiles.sync(req.user!.id, handle));
    } catch (error) {
      if (error instanceof CodeforcesError) throw new HttpError(error.status, error.code === "not_found" ? "Codeforces handle not found" : "Codeforces is temporarily unavailable; try again later");
      throw error;
    }
  }));
  return router;
}
