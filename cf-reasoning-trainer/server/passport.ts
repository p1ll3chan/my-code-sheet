import { Passport } from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Pool } from "pg";
import type { AuthService } from "./services/auth.service";
import type { PublicUser } from "../shared/contracts";
import { type Config, SESSION_MAX_AGE_MS } from "./config";

declare global { namespace Express { interface User extends PublicUser {} } }
export function sessionCookie(config: Config) {
  return { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}
export function cookieName(config: Config) { return config.NODE_ENV === "production" ? "__Host-cf.sid" : "cf.sid"; }

export function setupPassport(app: Express, pool: Pool, auth: AuthService, config: Config) {
  const PgSession = connectPgSimple(session);
  const store = new PgSession({ pool, tableName: "sessions", createTableIfMissing: false, pruneSessionInterval: 60,
    errorLog: () => console.error("Session storage unavailable"),
  });
  const passport = new Passport();
  app.set("trust proxy", config.TRUST_PROXY === "loopback" ? "loopback" : false);
  app.use("/api", session({
    name: cookieName(config), secret: config.SESSION_SECRET, resave: false, saveUninitialized: false, store,
    cookie: { ...sessionCookie(config), maxAge: SESSION_MAX_AGE_MS },
  }));
  app.use("/api", passport.initialize(), passport.session());
  app.use("/api", (req, res, next) => {
    if (req.isAuthenticated() && (!req.session.authenticatedAt || Date.now() - req.session.authenticatedAt >= SESSION_MAX_AGE_MS)) {
      req.session.destroy(error => {
        if (error) { next(error); return; }
        res.clearCookie(cookieName(config), sessionCookie(config));
        res.status(401).json({ message: "Session expired" });
      });
      return;
    }
    next();
  });
  passport.use(new LocalStrategy(async (username, password, done) => {
    try { done(null, await auth.authenticate(username, password)); } catch (error) { done(error); }
  }));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try { done(null, await auth.findPublicUser(id) ?? false); } catch (error) { done(error); }
  });
  return { passport, store };
}
