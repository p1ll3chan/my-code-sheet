import { Router } from "express";
import * as contestCtrl from "../controllers/contests.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const contestsRouter = Router();

contestsRouter.use(requireAuth);

contestsRouter.get("/", contestCtrl.listContests);
contestsRouter.post("/", contestCtrl.createContest);
contestsRouter.post("/blitz/queue", contestCtrl.matchBlitz);

contestsRouter.get("/:id", contestCtrl.getContest);
contestsRouter.post("/:id/join", contestCtrl.joinContest);
contestsRouter.post("/:id/problems/:problemId/submit", contestCtrl.submitProblem);
contestsRouter.get("/:id/leaderboard", contestCtrl.getLeaderboard);

export { contestsRouter };
