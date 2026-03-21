import type { Express } from "express";
import { type Server } from "http";
import { setupPassport } from "../passport";
import { authRouter } from "./auth.routes";
import { statsRouter } from "./stats.routes";
import { sheetsRouter, problemsRouter } from "./sheets.routes";
import { contestsRouter } from "./contests.routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupPassport(app);

  app.use("/api", authRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/sheets", sheetsRouter);
  app.use("/api/problems", problemsRouter);
  app.use("/api/contests", contestsRouter);

  return httpServer;
}
