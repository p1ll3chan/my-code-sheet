import { Router } from "express";
import { getDashboard } from "../controllers/stats.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const statsRouter = Router();

statsRouter.get("/dashboard", requireAuth, requireRole("student"), getDashboard);

export { statsRouter };
