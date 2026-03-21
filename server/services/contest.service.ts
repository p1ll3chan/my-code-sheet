import { db } from "../db";
import { contests, contestParticipants, contestProblems, submissions, users, type InsertContest, type InsertContestProblem } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export async function createContest(data: InsertContest, problemsData: Omit<InsertContestProblem, "contestId">[]) {
  const [contest] = await db.insert(contests).values(data).returning();
  if (problemsData && problemsData.length > 0) {
    const problemsWithContestId = problemsData.map(p => ({ ...p, contestId: contest.id }));
    await db.insert(contestProblems).values(problemsWithContestId);
  }
  return contest;
}

export async function listContests(type?: string) {
  return await db.select().from(contests)
    .where(type ? eq(contests.type, type) : undefined)
    .orderBy(desc(contests.createdAt));
}

export async function getContest(id: number) {
  const [contest] = await db.select().from(contests).where(eq(contests.id, id));
  if (!contest) return null;
  const problems = await db.select().from(contestProblems).where(eq(contestProblems.contestId, id)).orderBy(contestProblems.order);
  const participants = await db.select().from(contestParticipants).where(eq(contestParticipants.contestId, id));
  return { ...contest, problems, participants };
}

export async function joinContest(contestId: number, userId: number) {
  // Check if already joined
  const existing = await db.select().from(contestParticipants).where(and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId)));
  if (existing.length > 0) return existing[0];
  const [participant] = await db.insert(contestParticipants).values({ contestId, userId }).returning();
  return participant;
}

export async function submitProblem(contestId: number, userId: number, contestProblemId: number, status: string) {
  // Add to submissions
  const [submission] = await db.insert(submissions).values({
    userId,
    contestId,
    contestProblemId,
    status,
  }).returning();

  // If solved, update score
  if (status === 'Solved') {
    const [prob] = await db.select().from(contestProblems).where(eq(contestProblems.id, contestProblemId));
    const points = prob?.points || 100;
    
    const [participant] = await db.select().from(contestParticipants).where(and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId)));
    if (participant) {
      await db.update(contestParticipants)
        .set({ score: (participant.score || 0) + points })
        .where(eq(contestParticipants.id, participant.id));
    }
  }

  return submission;
}

export async function findOrCreateBlitzMatch(userId: number) {
  // Find a blitz contest that is upcoming with 1 participant (not us)
  const openContests = await db.select().from(contests)
    .where(and(
      eq(contests.type, 'blitz'),
      eq(contests.status, 'upcoming')
    ));

  for (const match of openContests) {
    const participants = await db.select().from(contestParticipants).where(eq(contestParticipants.contestId, match.id));
    if (participants.length === 1 && participants[0].userId !== userId) {
      // Join this match
      await joinContest(match.id, userId);
      // Update status to active
      await db.update(contests).set({ status: 'active', startTime: new Date() }).where(eq(contests.id, match.id));
      return match;
    }
  }

  // Create new blitz match
  const match = await createContest({
    title: "Blitz Match",
    type: "blitz",
    creatorId: userId,
    status: "upcoming"
  }, [{
    title: "Random Blitz Problem",
    link: "https://codeforces.com/problemset/problem/71/A",
    platform: "Codeforces",
    order: "A",
    points: 100
  }]);
  
  await joinContest(match.id, userId);
  return match;
}

export async function getContestLeaderboard(contestId: number) {
  const results = await db.select({
    participant: contestParticipants,
    user: {
      id: users.id,
      name: users.name,
      username: users.username
    }
  }).from(contestParticipants)
    .innerJoin(users, eq(contestParticipants.userId, users.id))
    .where(eq(contestParticipants.contestId, contestId))
    .orderBy(desc(contestParticipants.score));
    
  return results.map(r => ({
    ...r.participant,
    user: r.user
  }));
}
