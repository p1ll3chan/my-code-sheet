import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { Pool } from "pg";
import type { Database } from "./db";
import type { Config } from "./config";
import { assertDatabaseIdentity } from "./db/identity";
import { createAuthService } from "./services/auth.service";
import { createNotesService } from "./services/notes.service";
import { setupPassport } from "./passport";
import { mutationProtection } from "./middlewares/security";
import { createRoutes } from "./routes";
import { errorHandler } from "./http";
import { createCodeforcesClient, postgresRequestGate, type CodeforcesClient } from "./codeforces/client";
import { createCatalogService } from "./codeforces/catalog";
import { createProfileService } from "./codeforces/profile";
import { createTrainingService } from "./training/service";
import { createReasoningService } from "./reasoning/service";
import { createCoverageService } from "./reasoning/coverage";
import { createConfiguredReasoningModel } from "./reasoning/default-model";
import type { ModelAdapter } from "./reasoning/model";

export type LogEvent = { method: string; route: string; status: number; durationMs: number };
export async function createApp(config: Config, database: { pool: Pool; db: Database }, log: (event: LogEvent) => void = event => console.log(JSON.stringify(event)), cfClient?: CodeforcesClient,
  reasoningModel?: ModelAdapter) {
  await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
  const app = express();
  app.disable("x-powered-by");
  app.set("env", config.NODE_ENV);
  app.use(helmet({
    contentSecurityPolicy: config.NODE_ENV === "production" ? { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"], imgSrc: ["'self'", "data:"], connectSrc: ["'self'"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"],
    } } : false,
    strictTransportSecurity: config.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));
  app.get("/healthz", (_req, res) => { res.json({ status: "ok" }); });
  app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use("/api", (req, res, next) => {
    const start = performance.now();
    res.on("finish", () => log({ method: req.method, route: typeof req.route?.path === "string" ? req.route.path : "unmatched", status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
    next();
  });
  // Limit anonymous session creation as well as general API use.
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many requests" },
  }));
  app.use("/api", express.json({ limit: "16kb", strict: true }));
  const auth = await createAuthService(database.db);
  const { passport, store } = setupPassport(app, database.pool, auth, config);
  const client = cfClient ?? createCodeforcesClient({ gate: postgresRequestGate(database.pool) });
  app.use("/api", mutationProtection(config), createRoutes(auth, createNotesService(database.db), passport, config,
    createCatalogService(database.db, database.pool, client), createProfileService(database.db, database.pool, client),
    createTrainingService(database.db, database.pool), createReasoningService(database.db, database.pool, config, reasoningModel ?? createConfiguredReasoningModel(config)),
    createCoverageService(database.pool)));
  app.use(errorHandler);
  return { app, close: () => store.close() };
}
