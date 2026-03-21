import { Request, Response } from "express";
import * as sheetService from "../services/sheet.service";
import * as xlsx from "xlsx";

function detectPlatform(link: string): string {
  if (link.includes("codeforces.com")) return "Codeforces";
  if (link.includes("atcoder.jp")) return "AtCoder";
  if (link.includes("leetcode.com")) return "LeetCode";
  if (link.includes("cses.fi")) return "CSES";
  return "Custom";
}

export async function listSheets(req: Request, res: Response) {
  const userId = (req.user as any).id;
  const sheets = await sheetService.getSheets(userId);
  res.json(sheets);
}

export async function getSheet(req: Request, res: Response) {
  try {
    const sheetId = Number(req.params.id);
    const userId = (req.user as any).id;
    const sheet = await sheetService.getSheet(sheetId);
    
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    if (sheet.userId !== userId && (req.user as any).role !== "mentor") return res.status(403).json({ message: "Forbidden" });
    
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sheet" });
  }
}

export async function createSheet(req: Request, res: Response) {
  try {
    const userId = (req.user as any).id;
    const sheet = await sheetService.createSheet(userId, req.body);
    res.status(201).json(sheet);
  } catch (err) {
    res.status(400).json({ message: "Failed to create sheet" });
  }
}

export async function updateSheet(req: Request, res: Response) {
  try {
    const sheetId = Number(req.params.id);
    const userId = (req.user as any).id;
    const sheet = await sheetService.getSheet(sheetId);
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    if (sheet.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const updated = await sheetService.updateSheet(sheetId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: "Failed to update sheet" });
  }
}

export async function deleteSheet(req: Request, res: Response) {
  try {
    const sheetId = Number(req.params.id);
    const userId = (req.user as any).id;
    const sheet = await sheetService.getSheet(sheetId);
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    if (sheet.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    await sheetService.deleteSheet(sheetId);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ message: "Failed to delete sheet" });
  }
}

export async function getProblems(req: Request, res: Response) {
  try {
    const sheetId = Number(req.params.id);
    const userId = (req.user as any).id;
    const sheet = await sheetService.getSheet(sheetId);
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    if (sheet.userId !== userId && (req.user as any).role !== "mentor") return res.status(403).json({ message: "Forbidden" });

    const problems = await sheetService.getProblems(sheetId);
    res.json(problems);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch problems" });
  }
}

export async function createProblem(req: Request, res: Response) {
  try {
    const sheetId = Number(req.params.id);
    const userId = (req.user as any).id;
    const sheet = await sheetService.getSheet(sheetId);
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    if (sheet.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const problem = await sheetService.createProblem(sheetId, req.body);
    res.status(201).json(problem);
  } catch (err) {
    res.status(400).json({ message: "Failed to create problem" });
  }
}

export async function updateProblem(req: Request, res: Response) {
  try {
    const problemId = Number(req.params.id);
    const userId = (req.user as any).id;
    const updated = await sheetService.updateProblem(problemId, userId, req.body);
    if (!updated) return res.status(404).json({ message: "Problem not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: "Failed to update problem", error: err });
  }
}

export async function deleteProblem(req: Request, res: Response) {
  try {
    await sheetService.deleteProblem(Number(req.params.id));
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ message: "Failed to delete problem" });
  }
}

export async function bulkUpload(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const userId = (req.user as any).id;

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json<any>(worksheet);

    const problemsToCreate: any[] = [];
    for (const row of data) {
      const link = row["Problem Link"] || row["link"] || row["Link"] || row["URL"] || Object.values(row)[0];
      
      if (typeof link === 'string' && link.startsWith('http')) {
        const platform = row["Platform"] || row["platform"] || detectPlatform(link);
        const title = row["Title"] || row["title"] || row["Problem Name"] || "Untitled Problem";
        
        problemsToCreate.push({
          title,
          link,
          platform,
          difficulty: row["Difficulty"] || row["difficulty"] || null,
          topic: row["Topic"] || row["topic"] || null,
          notes: row["Notes"] || row["notes"] || null,
          status: "Not Started"
        });
      }
    }

    if (problemsToCreate.length === 0) {
      return res.status(400).json({ message: "No valid problems found in file" });
    }

    const sheet = await sheetService.createSheet(userId, {
      title: `Imported Sheet ${new Date().toLocaleDateString()}`,
      description: `Bulk upload from ${req.file.originalname}`,
      tags: [],
      difficulty: "Medium",
    });

    const problemEntities = await sheetService.createProblems(
      problemsToCreate.map(p => ({ ...p, sheetId: sheet.id }))
    );

    res.status(201).json({
      sheet_name: sheet.title,
      total_problems: problemEntities.length,
      problems: problemEntities
    });
  } catch (err) {
    res.status(400).json({ message: "Failed to parse file" });
  }
}
