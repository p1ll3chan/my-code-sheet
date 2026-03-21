import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { getUserByUsername, getUserById, comparePasswords } from "./services/auth.service";
import type { User } from "@shared/schema";

export function setupPassport(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "r3pl1t_s3cr3t_k3y",
    resave: false,
    saveUninitialized: false,
    store: undefined,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, (user as User).id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await getUserById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}
