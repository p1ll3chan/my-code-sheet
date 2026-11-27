import type { Request, Response, NextFunction } from "express";
import type { Passport } from "passport";
import type { AuthService } from "../services/auth.service";
import type { Config } from "../config";
import { registerSchema, loginSchema, publicUserSchema, type PublicUser } from "../../shared/contracts";
import { rotateCsrf } from "../middlewares/security";
import { cookieName, sessionCookie } from "../passport";
import { asyncHandler } from "../http";

function establishSession(req: Request, res: Response, next: NextFunction, user: PublicUser, status: number) {
  req.login(user, error => {
    if (error) { next(error); return; }
    req.session.authenticatedAt = Date.now();
    const csrfToken = rotateCsrf(req);
    req.session.save(error => {
      if (error) { next(error); return; }
      res.status(status).json({ user: publicUserSchema.parse(user), csrfToken });
    });
  });
}
export function authController(auth: AuthService, passport: InstanceType<typeof Passport>, config: Config) {
  return {
    csrf(req: Request, res: Response, next: NextFunction) {
      const csrfToken = req.session.csrfToken ?? rotateCsrf(req);
      req.session.save(error => { if (error) { next(error); return; } res.json({ csrfToken }); });
    },
    register: asyncHandler(async (req, res, next) => {
      const input = registerSchema.parse(req.body);
      const user = await auth.register(input);
      establishSession(req, res, next, user, 201);
    }),
    login(req: Request, res: Response, next: NextFunction) {
      try { req.body = loginSchema.parse(req.body); } catch (error) { next(error); return; }
      passport.authenticate("local", (error: unknown, user: PublicUser | false) => {
        if (error) { next(error); return; }
        if (!user) { res.status(401).json({ message: "Invalid username or password" }); return; }
        establishSession(req, res, next, user, 200);
      })(req, res, next);
    },
    logout(req: Request, res: Response, next: NextFunction) {
      req.logout(error => {
        if (error) { next(error); return; }
        req.session.destroy(error => {
          if (error) { next(error); return; }
          res.clearCookie(cookieName(config), sessionCookie(config));
          res.sendStatus(204);
        });
      });
    },
    me(req: Request, res: Response) { res.json(publicUserSchema.parse(req.user)); },
  };
}
