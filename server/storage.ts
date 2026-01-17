import { db } from "./db";
import { users, sheets, problems, type User, type InsertUser, type Sheet, type InsertSheet, type Problem, type InsertProblem } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSheets(userId: number): Promise<Sheet[]>;
  getSheet(id: number): Promise<Sheet | undefined>;
  createSheet(sheet: InsertSheet & { userId: number }): Promise<Sheet>;
  deleteSheet(id: number): Promise<void>;

  getProblems(sheetId: number): Promise<Problem[]>;
  createProblem(problem: InsertProblem): Promise<Problem>;
  createProblems(insertProblems: InsertProblem[]): Promise<Problem[]>;
  updateProblem(id: number, updates: Partial<InsertProblem> & { status?: string, solvedAt?: Date | null }): Promise<Problem | undefined>;
  deleteProblem(id: number): Promise<void>;

  getStats(userId: number): Promise<{
    totalProblems: number;
    totalSolved: number;
    solvedToday: number;
    progress: { date: string; count: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getSheets(userId: number): Promise<Sheet[]> {
    return await db.select().from(sheets).where(eq(sheets.userId, userId));
  }

  async getSheet(id: number): Promise<Sheet | undefined> {
    const [sheet] = await db.select().from(sheets).where(eq(sheets.id, id));
    return sheet;
  }

  async createSheet(insertSheet: InsertSheet & { userId: number }): Promise<Sheet> {
    const [sheet] = await db.insert(sheets).values(insertSheet).returning();
    return sheet;
  }

  async deleteSheet(id: number): Promise<void> {
    await db.delete(problems).where(eq(problems.sheetId, id));
    await db.delete(sheets).where(eq(sheets.id, id));
  }

  async getProblems(sheetId: number): Promise<Problem[]> {
    return await db.select().from(problems).where(eq(problems.sheetId, sheetId)).orderBy(problems.id);
  }

  async createProblem(insertProblem: InsertProblem): Promise<Problem> {
    const [problem] = await db.insert(problems).values(insertProblem).returning();
    return problem;
  }

  async createProblems(insertProblems: InsertProblem[]): Promise<Problem[]> {
    return await db.insert(problems).values(insertProblems).returning();
  }

  async updateProblem(id: number, updates: Partial<InsertProblem> & { status?: string, solvedAt?: Date | null }): Promise<Problem | undefined> {
    const [problem] = await db.update(problems).set(updates).where(eq(problems.id, id)).returning();
    return problem;
  }

  async deleteProblem(id: number): Promise<void> {
    await db.delete(problems).where(eq(problems.id, id));
  }

  async getStats(userId: number): Promise<{
    totalProblems: number;
    totalSolved: number;
    solvedToday: number;
    progress: { date: string; count: number }[];
  }> {
    const userSheets = await db.select().from(sheets).where(eq(sheets.userId, userId));
    const sheetIds = userSheets.map(s => s.id);

    if (sheetIds.length === 0) {
      return { totalProblems: 0, totalSolved: 0, solvedToday: 0, progress: [] };
    }

    const userProblems = await db.select().from(problems).where(inArray(problems.sheetId, sheetIds));

    const totalProblems = userProblems.length;
    const solvedProblems = userProblems.filter(p => p.status === 'Solved');
    const totalSolved = solvedProblems.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const solvedToday = solvedProblems.filter(p => p.solvedAt && new Date(p.solvedAt) >= today).length;

    const progressMap = new Map<string, number>();
    solvedProblems.forEach(p => {
      if (p.solvedAt) {
        const dateStr = new Date(p.solvedAt).toISOString().split('T')[0];
        progressMap.set(dateStr, (progressMap.get(dateStr) || 0) + 1);
      }
    });

    const progress = Array.from(progressMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { totalProblems, totalSolved, solvedToday, progress };
  }
}

export const storage = new DatabaseStorage();
