import { Request, Response, NextFunction } from "express";
import { hashPassword, createUser, getUserByUsername } from "../services/auth.service";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password, name, email, role, collegeClub, mentorId } = req.body;
    
    if (!username || !password || !name || !email || !role || !collegeClub) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (role !== "student" && role !== "mentor") {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await hashPassword(password);
    const user = await createUser({
      username,
      password: hashedPassword,
      name,
      email,
      role,
      collegeClub,
      mentorId: mentorId || null,
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  } catch (err) {
    next(err);
  }
}

export function login(req: Request, res: Response) {
  res.status(200).json(req.user);
}

export function logout(req: Request, res: Response, next: NextFunction) {
  req.logout((err) => {
    if (err) return next(err);
    res.sendStatus(200);
  });
}

export function getCurrentUser(req: Request, res: Response) {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  res.json(req.user);
}
