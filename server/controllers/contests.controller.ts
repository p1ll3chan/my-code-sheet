import { Request, Response } from "express";
import * as contestService from "../services/contest.service";

export async function createContest(req: Request, res: Response) {
  try {
    const userId = (req.user as any).id;
    const { problems, ...contestData } = req.body;
    
    const contest = await contestService.createContest(
      { ...contestData, creatorId: userId }, 
      problems || []
    );
    res.status(201).json(contest);
  } catch (error) {
    res.status(500).json({ message: "Failed to create contest" });
  }
}

export async function listContests(req: Request, res: Response) {
  try {
    const type = req.query.type as string;
    const contests = await contestService.listContests(type);
    res.json(contests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contests" });
  }
}

export async function getContest(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const contest = await contestService.getContest(id);
    if (!contest) return res.status(404).json({ message: "Contest not found" });
    res.json(contest);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contest" });
  }
}

export async function joinContest(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const participant = await contestService.joinContest(id, userId);
    res.json(participant);
  } catch (error) {
    res.status(500).json({ message: "Failed to join contest" });
  }
}

export async function submitProblem(req: Request, res: Response) {
  try {
    const contestId = parseInt(req.params.id);
    const contestProblemId = parseInt(req.params.problemId);
    const userId = (req.user as any).id;
    const { status } = req.body;
    
    const submission = await contestService.submitProblem(contestId, userId, contestProblemId, status);
    res.json(submission);
  } catch (error) {
    res.status(500).json({ message: "Failed to submit problem" });
  }
}

export async function matchBlitz(req: Request, res: Response) {
  try {
    const userId = (req.user as any).id;
    const match = await contestService.findOrCreateBlitzMatch(userId);
    res.json(match);
  } catch (error) {
    res.status(500).json({ message: "Failed to queue for Blitz" });
  }
}

export async function getLeaderboard(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const leaderboard = await contestService.getContestLeaderboard(id);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: "Failed to load leaderboard" });
  }
}
