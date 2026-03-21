import { Request, Response } from "express";
import { getDashboardStats } from "../services/stats.service";

export async function getDashboard(req: Request, res: Response) {
  try {
    const userId = (req.user as any).id;
    const stats = await getDashboardStats(userId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch stats" });
  }
}
