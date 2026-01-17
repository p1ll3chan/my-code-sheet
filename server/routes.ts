import { db } from "./db";
import { sheets } from "@shared/schema";

import type { Express, Request } from "express";
import { type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import * as xlsx from "xlsx";
import { type User } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

interface AppRequest extends Request {
  file?: Express.Multer.File;
}


function detectPlatform(link: string): string {
  if (link.includes("codeforces.com")) return "Codeforces";
  if (link.includes("atcoder.jp")) return "AtCoder";
  return "Custom";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  //setupAuth(app);


  app.get("/api/user", (_req, res) => {
  res.json({
    id: 1,
    username: "local-user",
  });
});


  app.get(api.sheets.list.path, async (_req, res) => {
    const allSheets = await db.select().from(sheets);
    res.json(allSheets);
  });

  // app.post(api.sheets.create.path, async (req: AuthenticatedRequest, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   try {
  //     const input = api.sheets.create.input.parse(req.body);
  //     const sheet = await storage.createSheet({ ...input, userId: req.user.id });
  //     res.status(201).json(sheet);
  //   } catch (err) {
  //     if (err instanceof z.ZodError) {
  //       return res.status(400).json({
  //         message: err.errors[0].message,
  //         field: err.errors[0].path.join('.'),
  //       });
  //     }
  //     throw err;
  //   }
  // });

  // app.post(api.sheets.bulkUpload.path, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  //   try {
  //     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
  //     const sheetName = workbook.SheetNames[0];
  //     const worksheet = workbook.Sheets[sheetName];
  //     const data = xlsx.utils.sheet_to_json<any>(worksheet);

  //     const problemsToCreate: any[] = [];
  //     for (const row of data) {
  //       const link = row["Problem Link"] || row["link"] || row["Link"] || row["URL"] || Object.values(row)[0];
        
  //       if (typeof link === 'string' && link.startsWith('http')) {
  //         const platform = row["Platform"] || row["platform"] || detectPlatform(link);
  //         const title = row["Title"] || row["title"] || row["Problem Name"] || "Untitled Problem";
          
  //         problemsToCreate.push({
  //           title,
  //           link,
  //           platform,
  //           difficulty: row["Difficulty"] || row["difficulty"] || null,
  //           topic: row["Topic"] || row["topic"] || null,
  //           notes: row["Notes"] || row["notes"] || null,
  //           status: "Not Started"
  //         });
  //       }
  //     }

  //     if (problemsToCreate.length === 0) {
  //       return res.status(400).json({ message: "No valid problems found in file" });
  //     }

  //     const sheet = await storage.createSheet({
  //       title: `Imported Sheet ${new Date().toLocaleDateString()}`,
  //       description: `Bulk upload from ${req.file.originalname}`,
  //       userId: req.user.id
  //     });

  //     const problemEntities = await storage.createProblems(
  //       problemsToCreate.map(p => ({ ...p, sheetId: sheet.id }))
  //     );

  //     res.status(201).json({
  //       sheet_name: sheet.title,
  //       total_problems: problemEntities.length,
  //       problems: problemEntities
  //     });
  //   } catch (err) {
  //     res.status(400).json({ message: "Failed to parse file" });
  //   }
  // });



  // app.get(api.sheets.get.path, async (req, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   const sheet = await storage.getSheet(Number(req.params.id));
  //   if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  //   if (sheet.userId !== req.user.id) return res.sendStatus(403);
  //   res.json(sheet);
  // });

  // app.delete(api.sheets.delete.path, async (req, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   const sheet = await storage.getSheet(Number(req.params.id));
  //   if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  //   if (sheet.userId !== req.user.id) return res.sendStatus(403);
  //   await storage.deleteSheet(sheet.id);
  //   res.sendStatus(204);
  // });

  // app.get(api.problems.list.path, async (req, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   const sheet = await storage.getSheet(Number(req.params.id));
  //   if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  //   if (sheet.userId !== req.user.id) return res.sendStatus(403);
    
  //   const problems = await storage.getProblems(sheet.id);
  //   res.json(problems);
  // });



  // app.post(api.problems.create.path, async (req: AuthenticatedRequest, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   const sheetId = Number(req.params.id);
  //   const sheet = await storage.getSheet(sheetId);
  //   if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  //   if (sheet.userId !== req.user.id) return res.sendStatus(403);

  //   try {
  //     const input = api.problems.create.input.parse(req.body);
  //     const problem = await storage.createProblem({ ...input, sheetId });
  //     res.status(201).json(problem);
  //   } catch (err) {
  //     if (err instanceof z.ZodError) {
  //       return res.status(400).json({
  //         message: err.errors[0].message,
  //         field: err.errors[0].path.join('.'),
  //       });
  //     }
  //     throw err;
  //   }
  // });

  // app.put(api.problems.update.path, async (req, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   try {
  //     const input = api.problems.update.input.parse(req.body);
  //     const solvedAt = input.status === 'Solved' ? new Date() : (input.status ? null : undefined);
      
  //     const problem = await storage.updateProblem(Number(req.params.id), { ...input, solvedAt });
  //     if (!problem) return res.status(404).json({ message: "Problem not found" });
  //     res.json(problem);
  //   } catch (err) {
  //     if (err instanceof z.ZodError) {
  //       return res.status(400).json({
  //         message: err.errors[0].message,
  //         field: err.errors[0].path.join('.'),
  //       });
  //     }
  //     throw err;
  //   }
  // });

  // app.delete(api.problems.delete.path, async (req, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   await storage.deleteProblem(Number(req.params.id));
  //   res.sendStatus(204);
  // });

  // app.get(api.stats.dashboard.path, async (req, res) => {
  //   if (!req.isAuthenticated()) return res.sendStatus(401);
  //   const stats = await storage.getStats(req.user.id);
  //   res.json(stats);
  // });

  return httpServer;
}
