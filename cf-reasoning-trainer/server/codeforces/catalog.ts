import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Database } from "../db";
import { cfCatalogState, cfContests, cfProblems } from "../db/schema";
import type { CodeforcesClient } from "./client";
import { atSeconds, problemKey, problemUrl } from "./types";

const WEEK = 7 * 24 * 60 * 60 * 1000;
export function createCatalogService(db: Database, pool: Pool, client: CodeforcesClient) {
  async function summary() {
    const [state] = await db.select().from(cfCatalogState).where(eq(cfCatalogState.id, 1));
    const [counts] = await db.select({
      total: sql<number>`count(*)::integer`,
      eligible: sql<number>`count(*) filter (where ${cfProblems.inProblemset} and ${cfProblems.rating} between 1200 and 2000)::integer`,
      unrated: sql<number>`count(*) filter (where ${cfProblems.inProblemset} and ${cfProblems.rating} is null)::integer`,
    }).from(cfProblems).where(eq(cfProblems.inProblemset, true));
    return { refreshedAt: state?.refreshedAt ?? null, lastError: state?.lastError ?? null, ...counts };
  }
  async function list(limit = 30, offset = 0) {
    return db.select({ key: cfProblems.key, contestId: cfProblems.contestId, index: cfProblems.index, name: cfProblems.name,
      rating: cfProblems.rating, solvedCount: cfProblems.solvedCount, url: cfProblems.url })
      .from(cfProblems).where(and(eq(cfProblems.inProblemset, true), gte(cfProblems.rating, 1200), lte(cfProblems.rating, 2000)))
      .orderBy(cfProblems.rating, cfProblems.key).limit(limit).offset(offset);
  }
  async function refresh(force = false) {
    const [state] = await db.select().from(cfCatalogState).where(eq(cfCatalogState.id, 1));
    if (!force && state?.refreshedAt && Date.now() - state.refreshedAt.getTime() < WEEK) return summary();
    // Concurrent refreshes share one database advisory lock. Each call rechecks freshness.
    const lock = await pool.connect();
    const acquired = await lock.query<{ locked: boolean }>("select pg_try_advisory_lock(730291) as locked");
    if (!acquired.rows[0]?.locked) { lock.release(); return summary(); }
    try {
      const [current] = await db.select().from(cfCatalogState).where(eq(cfCatalogState.id, 1));
      if (!force && current?.refreshedAt && Date.now() - current.refreshedAt.getTime() < WEEK) return summary();
      const [problemset, contests] = await Promise.all([client.problemset(true), client.contests(true)]);
      const stat = new Map(problemset.problemStatistics.map(item => [problemKey(item), item.solvedCount]));
      const seen = new Map<string, typeof cfProblems.$inferInsert>();
      const now = new Date();
      for (const problem of problemset.problems) {
        const key = problemKey(problem);
        if (!key) continue;
        seen.set(key, { key, contestId: problem.contestId ?? null, problemsetName: problem.problemsetName ?? null,
          index: problem.index, name: problem.name, type: problem.type, rating: problem.rating ?? null,
          points: problem.points ?? null, solvedCount: stat.get(key) ?? null, url: problemUrl(problem),
          inProblemset: true, lastSeenAt: now, updatedAt: now });
      }
      if (seen.size === 0) throw new Error("Empty Codeforces catalog");
      await db.transaction(async tx => {
        for (let i = 0; i < contests.length; i += 300) {
          const values = contests.slice(i, i + 300).map(item => ({ id: item.id, name: item.name, type: item.type,
            phase: item.phase, startAt: atSeconds(item.startTimeSeconds), durationSeconds: item.durationSeconds, updatedAt: now }));
          if (values.length) await tx.insert(cfContests).values(values).onConflictDoUpdate({ target: cfContests.id,
            set: { name: sql`excluded.name`, type: sql`excluded.type`, phase: sql`excluded.phase`,
              startAt: sql`excluded.start_at`, durationSeconds: sql`excluded.duration_seconds`, updatedAt: now } });
        }
        await tx.update(cfProblems).set({ inProblemset: false }).where(eq(cfProblems.inProblemset, true));
        const values = [...seen.values()];
        for (let i = 0; i < values.length; i += 300) await tx.insert(cfProblems).values(values.slice(i, i + 300))
          .onConflictDoUpdate({ target: cfProblems.key, set: { contestId: sql`excluded.contest_id`, problemsetName: sql`excluded.problemset_name`,
            index: sql`excluded.problem_index`, name: sql`excluded.name`, type: sql`excluded.type`, rating: sql`excluded.rating`,
            points: sql`excluded.points`, solvedCount: sql`excluded.solved_count`, url: sql`excluded.url`,
            inProblemset: true, lastSeenAt: now, updatedAt: now } });
        await tx.update(cfCatalogState).set({ refreshedAt: now, lastError: null }).where(eq(cfCatalogState.id, 1));
      });
      return summary();
    } catch (error) {
      await db.update(cfCatalogState).set({ lastError: "refresh_failed" }).where(eq(cfCatalogState.id, 1));
      throw error;
    } finally { await lock.query("select pg_advisory_unlock(730291)").catch(() => {}); lock.release(); }
  }
  return { summary, list, refresh };
}
