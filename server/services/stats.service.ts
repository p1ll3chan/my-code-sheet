import { db } from "../db";
import { sheets, problems, submissions } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export async function getDashboardStats(userId: number) {
  const userSheets = await db.select().from(sheets).where(eq(sheets.userId, userId));
  const sheetIds = userSheets.map((s) => s.id);
  
  if (sheetIds.length === 0) {
    return { totalProblems: 0, totalSolved: 0, solvedToday: 0, streak: 0, progress: [] };
  }

  const userProblems = await db.select().from(problems).where(inArray(problems.sheetId, sheetIds));
  const totalProblems = userProblems.length;

  const userSubmissions = await db.select().from(submissions).where(eq(submissions.userId, userId));
  
  const solvedProblemIds = new Set(
    userSubmissions.filter(s => s.status === 'Solved').map(s => s.problemId)
  );
  const totalSolved = solvedProblemIds.size;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const solvedToday = userSubmissions.filter(s => s.status === 'Solved' && new Date(s.submittedAt) >= today).length;

  const solvedDates = Array.from(new Set(
    userSubmissions
      .filter(s => s.status === 'Solved')
      .map(s => {
        const d = new Date(s.submittedAt);
        d.setHours(0,0,0,0);
        return d.getTime();
      })
  )).sort((a, b) => b - a);

  let streak = 0;
  let currentDate = today.getTime();
  
  for (let i = 0; i < solvedDates.length; i++) {
    const d = solvedDates[i];
    if (d === currentDate) {
      streak++;
      currentDate -= 86400000;
    } else if (d === currentDate - 86400000 && streak === 0) {
      streak++;
      currentDate = d - 86400000;
    } else {
      break;
    }
  }

  const progressMap = new Map<string, number>();
  userSubmissions.filter(s => s.status === 'Solved').forEach(s => {
    const dateStr = new Date(s.submittedAt).toISOString().split('T')[0];
    progressMap.set(dateStr, (progressMap.get(dateStr) || 0) + 1);
  });

  const progress = Array.from(progressMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { totalProblems, totalSolved, solvedToday, streak, progress };
}
