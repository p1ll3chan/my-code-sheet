import { Router } from "express";
import passport from "passport";
import { register, login, logout, getCurrentUser } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", passport.authenticate("local"), login);
authRouter.post("/logout", logout);
authRouter.get("/user", requireAuth, getCurrentUser);

export { authRouter };
