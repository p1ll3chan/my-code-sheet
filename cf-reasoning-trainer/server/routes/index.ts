import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Passport } from "passport";
import { authController } from "../controllers/auth.controller";
import { notesController } from "../controllers/notes.controller";
import { requireAuth } from "../middlewares/security";
import type { AuthService } from "../services/auth.service";
import type { NotesService } from "../services/notes.service";
import type { Config } from "../config";
import { codeforcesRouter } from "../controllers/codeforces.controller";
import type { createCatalogService } from "../codeforces/catalog";
import type { createProfileService } from "../codeforces/profile";
import { trainingRouter } from "../controllers/training.controller";
import type { createTrainingService } from "../training/service";
import { reasoningRouter } from "../controllers/reasoning.controller";
import type { createReasoningService } from "../reasoning/service";
import type { createCoverageService } from "../reasoning/coverage";

export function createRoutes(auth: AuthService, notes: NotesService, passport: InstanceType<typeof Passport>, config: Config,
  catalog: ReturnType<typeof createCatalogService>, profiles: ReturnType<typeof createProfileService>, training: ReturnType<typeof createTrainingService>,
  reasoning: ReturnType<typeof createReasoningService>, coverage: ReturnType<typeof createCoverageService>) {
  const router = Router();
  const authCtrl = authController(auth, passport, config);
  const notesCtrl = notesController(notes);
  // One shared limiter bounds both password verification and registration hashing.
  // Single-process deployment only; a shared store is required before horizontal scaling.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many authentication attempts; try again later" },
  });
  router.get("/csrf", authCtrl.csrf);
  router.post("/register", authLimiter, authCtrl.register);
  router.post("/login", authLimiter, authCtrl.login);
  router.post("/logout", requireAuth, authCtrl.logout);
  router.get("/user", requireAuth, authCtrl.me);
  router.get("/notes", requireAuth, notesCtrl.list);
  router.post("/notes", requireAuth, notesCtrl.create);
  router.get("/notes/:id", requireAuth, notesCtrl.get);
  router.put("/notes/:id", requireAuth, notesCtrl.update);
  router.delete("/notes/:id", requireAuth, notesCtrl.delete);
  router.use("/codeforces", codeforcesRouter(catalog, profiles));
  router.use("/training", trainingRouter(training));
  router.use("/reasoning", reasoningRouter(reasoning, coverage));
  router.use((_req, res) => { res.status(404).json({ message: "API route not found" }); });
  return router;
}
