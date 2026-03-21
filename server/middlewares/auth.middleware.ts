import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function requireRole(role: "student" | "mentor") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userRole = (req.user as any).role;
    
    if (userRole !== role) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };
}
