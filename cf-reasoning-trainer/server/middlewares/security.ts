import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import type { Config } from "../config";

declare module "express-session" {
  interface SessionData { csrfToken?: string; authenticatedAt?: number; }
}
export function rotateCsrf(req: Request): string {
  req.session.csrfToken = randomBytes(32).toString("hex");
  return req.session.csrfToken;
}
export function mutationProtection(config: Config): RequestHandler {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    if (req.get("origin") !== config.APP_ORIGIN || req.get("sec-fetch-site") === "cross-site") {
      res.status(403).json({ message: "Request origin rejected" }); return;
    }
    if (!req.is("application/json")) { res.status(415).json({ message: "JSON requests required" }); return; }
    const supplied = req.get("x-csrf-token");
    const expected = req.session.csrfToken;
    if (!supplied || !expected || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      res.status(403).json({ message: "Invalid CSRF token" }); return;
    }
    next();
  };
}
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) { res.status(401).json({ message: "Authentication required" }); return; }
  next();
};
