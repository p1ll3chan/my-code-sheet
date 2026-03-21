import { db } from "../db";
import { sheets, problems, submissions } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Sheet, InsertSheet, Problem, InsertProblem } from "@shared/schema";

export async function getSheets(userId: number): Promise<Sheet[]> {
  return db.select().from(sheets).where(eq(sheets.userId, userId));
}

export async function getSheet(id: number): Promise<Sheet | undefined> {
  const [sheet] = await db.select().from(sheets).where(eq(sheets.id, id));
  return sheet;
}

export async function createSheet(userId: number, input: InsertSheet): Promise<Sheet> {
  const [sheet] = await db.insert(sheets).values({ ...input, userId }).returning();
  return sheet;
}

export async function updateSheet(id: number, input: Partial<InsertSheet>): Promise<Sheet | undefined> {
  const [sheet] = await db.update(sheets).set(input).where(eq(sheets.id, id)).returning();
  return sheet;
}

export async function deleteSheet(id: number): Promise<void> {
  await db.delete(problems).where(eq(problems.sheetId, id));
  await db.delete(sheets).where(eq(sheets.id, id));
}

export async function getProblems(sheetId: number): Promise<Problem[]> {
  return db.select().from(problems).where(eq(problems.sheetId, sheetId)).orderBy(problems.id);
}

export async function createProblem(sheetId: number, input: InsertProblem): Promise<Problem> {
  const [problem] = await db.insert(problems).values({ ...input, sheetId }).returning();
  return problem;
}

export async function createProblems(inputs: (InsertProblem & { sheetId: number })[]): Promise<Problem[]> {
  return db.insert(problems).values(inputs).returning();
}

export async function updateProblem(id: number, userId: number, updates: Partial<InsertProblem> & { status?: string }): Promise<Problem | undefined> {
  const finalUpdates: any = { ...updates };
  
  if (updates.status === 'Solved') {
    finalUpdates.solvedAt = new Date();
    await db.insert(submissions).values({
      userId,
      problemId: id,
      status: 'Solved',
      submittedAt: finalUpdates.solvedAt
    });
  }
  
  const [problem] = await db.update(problems).set(finalUpdates).where(eq(problems.id, id)).returning();
  return problem;
}

export async function deleteProblem(id: number): Promise<void> {
  await db.delete(submissions).where(eq(submissions.problemId, id));
  await db.delete(problems).where(eq(problems.id, id));
}
