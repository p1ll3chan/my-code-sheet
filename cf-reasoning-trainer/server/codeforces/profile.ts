import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Database } from "../db";
import { cfContests, cfProblems, cfProfiles, cfRatingChanges, cfSubmissions } from "../db/schema";
import { HttpError } from "../http";
import type { CodeforcesClient } from "./client";
import { atSeconds, cfHandleSchema, problemKey, problemUrl, type CfSubmission } from "./types";
import { analyzeProfile } from "./analytics";

const WEEK = 7 * 24 * 60 * 60 * 1000;
export function createProfileService(db: Database, pool: Pool, client: CodeforcesClient) {
  async function active(userId: number) {
    const [profile] = await db.select().from(cfProfiles).where(and(eq(cfProfiles.userId, userId), eq(cfProfiles.active, true)));
    return profile ?? null;
  }
  async function snapshot(userId: number) {
    const profile = await active(userId);
    if (!profile) return null;
    const [submissions, ratings] = await Promise.all([
      db.select().from(cfSubmissions).where(eq(cfSubmissions.profileId, profile.id)).orderBy(desc(cfSubmissions.submissionId)),
      db.select().from(cfRatingChanges).where(eq(cfRatingChanges.profileId, profile.id)).orderBy(desc(cfRatingChanges.updatedAt)),
    ]);
    const contestIds = [...new Set(submissions.map(s => s.contestId).filter((id): id is number => id !== null))];
    const contests = contestIds.length ? await db.select().from(cfContests).where(inArray(cfContests.id, contestIds)) : [];
    return { handle: profile.handle, rating: profile.rating, maxRating: profile.maxRating,
      historyComplete: profile.historyComplete, lastSyncedAt: profile.lastSyncedAt, lastError: profile.lastError,
      submissionCount: submissions.length, ...analyzeProfile(submissions, ratings, contests),
      recentSubmissions: submissions.slice(0, 20).map(s => ({ id: s.submissionId, problemName: s.problemName,
        problemRating: s.problemRating, verdict: s.verdict, participantType: s.participantType, createdAt: s.createdAt,
        problemUrl: s.problemContestId ? problemUrl({ contestId: s.problemContestId, index: s.problemIndex }) : null })),
      ratingHistory: ratings.map(r => ({ contestId: r.contestId, contestName: r.contestName, rank: r.rank,
        oldRating: r.oldRating, newRating: r.newRating, updatedAt: r.updatedAt })),
    };
  }
  async function submissionsPage(userId: number, before?: number, limit = 50) {
    const profile = await active(userId);
    if (!profile) return [];
    const condition = before ? and(eq(cfSubmissions.profileId, profile.id), sql`${cfSubmissions.submissionId} < ${before}`) : eq(cfSubmissions.profileId, profile.id);
    return db.select({ id: cfSubmissions.submissionId, problemKey: cfSubmissions.problemKey, problemName: cfSubmissions.problemName,
      problemRating: cfSubmissions.problemRating, verdict: cfSubmissions.verdict, participantType: cfSubmissions.participantType,
      contestId: cfSubmissions.contestId, createdAt: cfSubmissions.createdAt, problemIndex: cfSubmissions.problemIndex,
      problemContestId: cfSubmissions.problemContestId })
      .from(cfSubmissions).where(condition).orderBy(desc(cfSubmissions.submissionId)).limit(limit);
  }
  async function sync(userId: number, rawHandle: string) {
    const handle = cfHandleSchema.parse(rawHandle);
    const lock = await pool.connect();
    const lockKey = `cf-profile:${userId}`;
    try {
      await lock.query("select pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
      const users = await client.user(handle);
      if (users.length !== 1) throw new HttpError(404, "Codeforces handle not found");
      const canonical = users[0].handle;
      const lower = canonical.toLowerCase();
      let [profile] = await db.select().from(cfProfiles).where(and(eq(cfProfiles.userId, userId), eq(cfProfiles.handleLower, lower)));
      if (!profile) {
        [profile] = await db.insert(cfProfiles).values({ userId, handle: canonical, handleLower: lower }).returning();
      }
      const started = new Date();
      await db.update(cfProfiles).set({ lastAttemptAt: started, lastError: null }).where(eq(cfProfiles.id, profile.id));
      try {
        const ratings = await client.ratings(canonical);
        const full = !profile.historyComplete || !profile.lastFullSyncedAt || Date.now() - profile.lastFullSyncedAt.getTime() >= WEEK;
        const oldMax = profile.maxSubmissionId ?? 0;
        let from = 1, maxId = oldMax;
        while (true) {
          const page = await client.submissions(canonical, from, 1000);
          if (page.length === 0) break;
          maxId = Math.max(maxId, ...page.map(item => item.id));
          await persistSubmissions(profile.id, page);
          // Recheck the entire boundary page so verdict changes and newly added
          // submissions do not get lost between incremental syncs.
          if (!full && page.some(item => item.id <= oldMax)) break;
          if (page.length < 1000) break;
          from += page.length;
        }
        await db.transaction(async tx => {
          await tx.delete(cfRatingChanges).where(eq(cfRatingChanges.profileId, profile.id));
          if (ratings.length) await tx.insert(cfRatingChanges).values(ratings.map(item => ({ profileId: profile.id,
            contestId: item.contestId, contestName: item.contestName, rank: item.rank, oldRating: item.oldRating,
            newRating: item.newRating, updatedAt: atSeconds(item.ratingUpdateTimeSeconds)! })));
          await tx.update(cfProfiles).set({ active: false }).where(and(eq(cfProfiles.userId, userId), eq(cfProfiles.active, true)));
          await tx.update(cfProfiles).set({ handle: canonical, rating: users[0].rating ?? null, maxRating: users[0].maxRating ?? null,
            active: true, maxSubmissionId: maxId || null, historyComplete: true, lastSyncedAt: new Date(),
            lastFullSyncedAt: full ? new Date() : profile.lastFullSyncedAt, lastError: null }).where(eq(cfProfiles.id, profile.id));
        });
      } catch (error) {
        await db.update(cfProfiles).set({ lastError: "sync_failed" }).where(eq(cfProfiles.id, profile.id));
        throw error;
      }
      return snapshot(userId);
    } finally {
      await lock.query("select pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]).catch(() => {});
      lock.release();
    }
  }
  async function persistSubmissions(profileId: number, page: CfSubmission[]) {
    const now = new Date();
    const problems = new Map<string, typeof cfProblems.$inferInsert>();
    for (const item of page) {
      const key = problemKey(item.problem);
      if (key) problems.set(key, { key, contestId: item.problem.contestId ?? null,
        problemsetName: item.problem.problemsetName ?? null, index: item.problem.index,
        name: item.problem.name, type: item.problem.type, rating: item.problem.rating ?? null,
        points: item.problem.points ?? null, url: problemUrl(item.problem), updatedAt: now });
    }
    await db.transaction(async tx => {
      const problemValues = [...problems.values()];
      for (let i = 0; i < problemValues.length; i += 300) await tx.insert(cfProblems).values(problemValues.slice(i, i + 300)).onConflictDoNothing();
      const unique = [...new Map(page.map(item => [item.id, item])).values()];
      for (let i = 0; i < unique.length; i += 250) {
        await tx.insert(cfSubmissions).values(unique.slice(i, i + 250).map(item => ({ profileId, submissionId: item.id,
          problemKey: problemKey(item.problem), contestId: item.contestId ?? item.author.contestId ?? null,
          problemContestId: item.problem.contestId ?? null, problemsetName: item.problem.problemsetName ?? null,
          problemIndex: item.problem.index, problemName: item.problem.name, problemRating: item.problem.rating ?? null,
          problemType: item.problem.type, createdAt: atSeconds(item.creationTimeSeconds)!,
          relativeTimeSeconds: item.relativeTimeSeconds ?? null, partyStartAt: atSeconds(item.author.startTimeSeconds),
          participantType: item.author.participantType, verdict: item.verdict ?? null,
          language: item.programmingLanguage, testset: item.testset, passedTestCount: item.passedTestCount,
          timeConsumedMillis: item.timeConsumedMillis, memoryConsumedBytes: item.memoryConsumedBytes })))
          .onConflictDoUpdate({ target: [cfSubmissions.profileId, cfSubmissions.submissionId], set: {
            problemKey: sql`excluded.problem_key`, problemRating: sql`excluded.problem_rating`, verdict: sql`excluded.verdict`,
            participantType: sql`excluded.participant_type`, createdAt: sql`excluded.created_at`,
            relativeTimeSeconds: sql`excluded.relative_time_seconds`, partyStartAt: sql`excluded.party_start_at` } });
      }
    });
  }
  return { active, snapshot, submissionsPage, sync };
}
