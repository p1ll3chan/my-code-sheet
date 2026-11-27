import { and, asc, desc, eq, gte, inArray, isNotNull, lte, lt, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { GoalInput, TrainingEvent } from "../../shared/training";
import { daysBetween, bandPerformance, capacityForDay, localDay, recommendDay, type Candidate, type PastAssignment } from "./planner";
import { applyTimerEvent, projectTimer } from "./timer";
import type { Database } from "../db";
import { cfContests, cfProblems, cfProfiles, cfSubmissions, trainingAssignments, trainingDayOverrides, trainingDays, trainingGoals } from "../db/schema";
import { HttpError } from "../http";

type Assignment = typeof trainingAssignments.$inferSelect;
function goalDto(row: typeof trainingGoals.$inferSelect): GoalInput {
  return { targetRating: row.targetRating, deadline: row.deadline, dailyMinutes: row.dailyMinutes, trainingDays: row.trainingDays,
    intensity: row.intensity as GoalInput["intensity"], focus: row.focus as GoalInput["focus"],
    progression: row.progression as GoalInput["progression"], timeZone: row.timeZone };
}
function past(row: Assignment): PastAssignment { return row; }
export function createTrainingService(db: Database, pool: Pool, now: () => Date = () => new Date()) {
  async function goalFor(userId: number) {
    const [row] = await db.select().from(trainingGoals).where(eq(trainingGoals.userId, userId));
    return row ?? null;
  }
  async function profileFor(userId: number) {
    const [row] = await db.select({ id: cfProfiles.id, handle: cfProfiles.handle, rating: cfProfiles.rating })
      .from(cfProfiles).where(and(eq(cfProfiles.userId, userId), eq(cfProfiles.active, true)));
    return row ?? null;
  }
  async function setGoal(userId: number, input: GoalInput) {
    const today = localDay(now(), input.timeZone);
    if (input.deadline < today) throw new HttpError(400, "Deadline must be today or later in your time zone");
    if (daysBetween(today, input.deadline) > 1095) throw new HttpError(400, "Choose a deadline within three years");
    await db.insert(trainingGoals).values({ userId, ...input, trainingDays: [...input.trainingDays].sort((a, b) => a - b), updatedAt: now() })
      .onConflictDoUpdate({ target: trainingGoals.userId, set: { targetRating: input.targetRating, deadline: input.deadline,
        dailyMinutes: input.dailyMinutes, trainingDays: [...input.trainingDays].sort((a, b) => a - b),
        intensity: input.intensity, focus: input.focus, progression: input.progression, timeZone: input.timeZone, updatedAt: now() } });
    const [existingDay] = await db.select({ day: trainingDays.day }).from(trainingDays)
      .where(and(eq(trainingDays.userId, userId), eq(trainingDays.day, today)));
    if (existingDay && await profileFor(userId)) await planToday(userId);
    return overview(userId);
  }
  async function setDayOverride(userId: number, input: { day: string; minutes: number; kind: "break" | "recovery" | "custom" }) {
    const goal = await goalFor(userId);
    if (!goal) throw new HttpError(409, "Set a training goal first");
    const today = localDay(now(), goal.timeZone);
    if (input.day < today || input.day > goal.deadline || daysBetween(today, input.day) > 30) throw new HttpError(400, "Choose a date within the next 30 days and before the deadline");
    await db.insert(trainingDayOverrides).values({ userId, ...input }).onConflictDoUpdate({ target: [trainingDayOverrides.userId, trainingDayOverrides.day],
      set: { minutes: input.minutes, kind: input.kind } });
    if (input.day === today && await profileFor(userId)) await planToday(userId);
    return overview(userId);
  }
  async function listAssignments(userId: number, day: string) {
    const rows = await db.select({ assignment: trainingAssignments, name: cfProblems.name, url: cfProblems.url })
      .from(trainingAssignments).innerJoin(cfProblems, eq(trainingAssignments.problemKey, cfProblems.key))
      .where(and(eq(trainingAssignments.userId, userId), eq(trainingAssignments.day, day)))
      .orderBy(asc(trainingAssignments.priority), asc(trainingAssignments.id));
    const at = now();
    return rows.map(({ assignment, name, url }) => ({ ...assignment, name, url, ...projectTimer(assignment, at) }));
  }
  async function overview(userId: number) {
    const [goalRow, profile] = await Promise.all([goalFor(userId), profileFor(userId)]);
    if (!goalRow) return { serverNow: now().toISOString(), goal: null, profile: profile ? { handle: profile.handle, currentRating: profile.rating } : null,
      today: null, progress: null };
    const goal = goalDto(goalRow);
    const today = localDay(now(), goal.timeZone);
    const [override] = await db.select().from(trainingDayOverrides).where(and(eq(trainingDayOverrides.userId, userId), eq(trainingDayOverrides.day, today)));
    const [dayRow] = await db.select().from(trainingDays).where(and(eq(trainingDays.userId, userId), eq(trainingDays.day, today)));
    const all = await db.select().from(trainingAssignments).where(eq(trainingAssignments.userId, userId));
    const performance = bandPerformance(all.map(past), profile?.rating ?? null, goal.targetRating);
    const assignments = await listAssignments(userId, today);
    const capacityMinutes = capacityForDay(goal, today, override);
    const reservedMinutes = assignments.filter(item => !["postponed", "rescheduled"].includes(item.status)).reduce((sum, item) => sum + item.plannedMinutes, 0);
    const recordedTodayMinutes = Math.ceil(assignments.reduce((sum, item) => sum + item.thinkingMs + item.implementationMs, 0) / 60_000);
    const from = localDay(goalRow.updatedAt, goal.timeZone);
    const until = today < goal.deadline ? today : goal.deadline;
    const overrides = await db.select().from(trainingDayOverrides).where(eq(trainingDayOverrides.userId, userId));
    const overrideMap = new Map(overrides.map(item => [item.day, item]));
    let scheduledDays = 0, plannedMinutes = 0, availableMinutes = 0;
    for (let offset = 0; offset <= Math.max(-1, daysBetween(from, until)); offset++) {
      const day = new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
      const minutes = capacityForDay(goal, day, overrideMap.get(day));
      if (minutes >= 15) {
        scheduledDays++; availableMinutes += minutes;
        const fraction = { light: 0.65, standard: 0.82, intense: 1 }[goal.intensity];
        plannedMinutes += Math.min(minutes, Math.max(15, Math.floor(minutes * fraction)));
      }
    }
    const period = all.filter(item => item.day >= from);
    const recordedMinutes = Math.ceil(period.reduce((sum, item) => sum + item.thinkingMs + item.implementationMs, 0) / 60_000);
    const plannedWorkMinutes = period.filter(item => item.status !== "postponed").reduce((sum, item) => sum + item.plannedMinutes, 0);
    const completedWorkMinutes = period.filter(item => item.status === "completed").reduce((sum, item) => sum + item.plannedMinutes, 0);
    const completedAssignments = period.filter(item => item.status === "completed").length;
    const daysRemaining = Math.max(0, daysBetween(today, goal.deadline));
    const pace = plannedMinutes ? Math.min(1, recordedMinutes / plannedMinutes) : null;
    const assessment = profile?.rating !== null && profile?.rating !== undefined && profile.rating >= goal.targetRating ? "on_track"
      : today > goal.deadline ? "behind" : scheduledDays < 3 || pace === null ? "uncertain" : pace < 0.4 ? "behind" : pace >= 0.75 ? "on_track" : "uncertain";
    return { serverNow: now().toISOString(), goal, profile: profile ? { handle: profile.handle, currentRating: profile.rating } : null,
      today: { day: today, capacityMinutes, generated: !!dayRow, band: dayRow?.band ?? performance.currentBand,
        assignments, reservedMinutes, recordedTodayMinutes, overCapacity: reservedMinutes > capacityMinutes || recordedTodayMinutes > capacityMinutes,
        override: override ? { kind: override.kind, minutes: override.minutes } : null },
      progress: { estimatedReadiness: performance.estimatedReadiness, currentTrainingBand: performance.currentBand,
        bandStats: performance.stats, daysRemaining, scheduledDays, plannedMinutes, availableMinutes, recordedMinutes,
        plannedWorkMinutes, completedWorkMinutes, completedAssignments,
        pace, assessment, assessmentBasis: "Training adherence only; this is not a Codeforces rating forecast." } };
  }
  async function planToday(userId: number) {
    const lock = await pool.connect();
    const key = `training:${userId}`;
    try {
      await lock.query("select pg_advisory_lock(hashtextextended($1, 0))", [key]);
      const goalRow = await goalFor(userId);
      if (!goalRow) throw new HttpError(409, "Set a training goal first");
      const profile = await profileFor(userId);
      if (!profile) throw new HttpError(409, "Connect a Codeforces handle first");
      const goal = goalDto(goalRow);
      const today = localDay(now(), goal.timeZone);
      const [override] = await db.select().from(trainingDayOverrides).where(and(eq(trainingDayOverrides.userId, userId), eq(trainingDayOverrides.day, today)));
      const [existingDay] = await db.select().from(trainingDays).where(and(eq(trainingDays.userId, userId), eq(trainingDays.day, today)));
      // An old running timer cannot be assumed active across a calendar change.
      await db.update(trainingAssignments).set({ status: "unfinished", outcome: "unfinished", segmentStartedAt: null, finishedAt: now() })
        .where(and(eq(trainingAssignments.userId, userId), sql`${trainingAssignments.day} < ${today}`,
          inArray(trainingAssignments.status, ["thinking", "implementing", "paused_thinking", "paused_implementing"])));
      const all = await db.select().from(trainingAssignments).where(eq(trainingAssignments.userId, userId));
      const candidateRows = await db.select({ key: cfProblems.key, rating: cfProblems.rating, name: cfProblems.name,
        url: cfProblems.url, solvedCount: cfProblems.solvedCount, contestStartAt: cfContests.startAt })
        .from(cfProblems).leftJoin(cfContests, eq(cfProblems.contestId, cfContests.id))
        .where(and(eq(cfProblems.inProblemset, true), gte(cfProblems.rating, 1200), lte(cfProblems.rating, 2000), isNotNull(cfProblems.url)));
      const candidates: Candidate[] = candidateRows.map(item => ({ ...item, rating: item.rating!, url: item.url! }));
      const submissions = await db.select({ key: cfSubmissions.problemKey, verdict: cfSubmissions.verdict })
        .from(cfSubmissions).where(eq(cfSubmissions.profileId, profile.id));
      const cfSolved = new Set(submissions.filter(item => item.verdict === "OK" && item.key).map(item => item.key!));
      const cfAttempted = new Set(submissions.filter(item => item.key).map(item => item.key!));
      const recommendation = recommendDay({ goal, day: today, override, currentRating: profile.rating,
        candidates, history: all.map(past), cfSolved, cfAttempted });
      await db.transaction(async tx => {
        await tx.insert(trainingDays).values({ userId, day: today, capacityMinutes: recommendation.capacityMinutes,
          band: recommendation.currentBand, generatedAt: now() }).onConflictDoUpdate({ target: [trainingDays.userId, trainingDays.day],
          set: { capacityMinutes: recommendation.capacityMinutes, band: recommendation.currentBand } });
        const todayRows = all.filter(item => item.day === today);
        const activeRows = todayRows.filter(item => !["postponed", "rescheduled"].includes(item.status));
        let reserved = activeRows.reduce((sum, item) => sum + item.plannedMinutes, 0);
        // An availability decrease removes future pending work first. Active or
        // already completed time is reported as an explicit overrun instead.
        const limit = recommendation.targetMinutes;
        for (const item of [...activeRows].filter(item => item.status === "pending").sort((a, b) => b.priority - a.priority)) {
          if (reserved <= limit) break;
          const reduced = item.plannedMinutes - (reserved - limit);
          if (reduced >= 15) {
            await tx.update(trainingAssignments).set({ plannedMinutes: reduced,
              thinkingBudgetMinutes: Math.min(reduced, item.thinkingBudgetMinutes) }).where(eq(trainingAssignments.id, item.id));
            reserved = limit;
          } else {
            await tx.update(trainingAssignments).set({ status: "postponed" }).where(eq(trainingAssignments.id, item.id));
            reserved -= item.plannedMinutes;
          }
        }
        if (!existingDay || existingDay.capacityMinutes < recommendation.capacityMinutes) {
          for (const item of todayRows.filter(row => row.status === "postponed").sort((a, b) => a.priority - b.priority)) {
            const available = limit - reserved;
            if (available < 15) break;
            const plannedMinutes = Math.min(item.plannedMinutes, available);
            await tx.update(trainingAssignments).set({ status: "pending", plannedMinutes,
              thinkingBudgetMinutes: Math.min(plannedMinutes, item.thinkingBudgetMinutes) }).where(eq(trainingAssignments.id, item.id));
            reserved += plannedMinutes;
          }
        }
        if (existingDay && existingDay.capacityMinutes >= recommendation.capacityMinutes && todayRows.length > 0) return;
        const existingKeys = new Set(todayRows.map(item => item.problemKey));
        const newItems = recommendation.assignments.filter(item => !existingKeys.has(item.problemKey));
        let nextPriority = todayRows.length + 1;
        for (const item of newItems) {
          if (nextPriority > 3) break;
          if (reserved + item.plannedMinutes > recommendation.capacityMinutes || reserved + item.plannedMinutes > recommendation.targetMinutes) continue;
          const prior = item.carryFromId ? all.find(row => row.id === item.carryFromId && row.userId === userId) : null;
          if (prior) await tx.update(trainingAssignments).set({ status: "rescheduled", segmentStartedAt: null }).where(eq(trainingAssignments.id, prior.id));
          await tx.insert(trainingAssignments).values({ userId, day: today, problemKey: item.problemKey, carryFromId: prior?.id ?? null,
            rating: item.rating, purpose: item.purpose, priority: nextPriority++, plannedMinutes: item.plannedMinutes,
            thinkingBudgetMinutes: item.thinkingBudgetMinutes, observation: prior?.observation ?? null,
            firstObservationAt: prior?.firstObservationAt ?? null, firstObservationThinkingMs: prior?.firstObservationThinkingMs ?? null,
            hintUsed: prior?.hintUsed ?? false, editorialUsed: prior?.editorialUsed ?? false });
          reserved += item.plannedMinutes;
        }
        await tx.update(trainingAssignments).set({ status: "postponed" }).where(and(eq(trainingAssignments.userId, userId),
          sql`${trainingAssignments.day} < ${today}`, inArray(trainingAssignments.status, ["pending", "unfinished"])));
      });
      return overview(userId);
    } finally { await lock.query("select pg_advisory_unlock(hashtextextended($1, 0))", [key]).catch(() => {}); lock.release(); }
  }
  async function event(userId: number, assignmentId: number, input: TrainingEvent) {
    const lock = await pool.connect();
    const key = `training:${userId}`;
    try {
      await lock.query("select pg_advisory_lock(hashtextextended($1, 0))", [key]);
      const goalRow = await goalFor(userId);
      if (!goalRow) throw new HttpError(409, "Set a training goal first");
      const today = localDay(now(), goalRow.timeZone);
      const changed = await db.transaction(async tx => {
        const [row] = await tx.select().from(trainingAssignments)
          .where(and(eq(trainingAssignments.id, assignmentId), eq(trainingAssignments.userId, userId))).for("update");
        if (!row) throw new HttpError(404, "Assignment not found");
        if (row.day !== today) throw new HttpError(409, "This assignment belongs to another day; plan today's work to resume it");
        const patch = applyTimerEvent(row, input, now());
        if (!Object.keys(patch).length) return row;
        const [updated] = await tx.update(trainingAssignments).set(patch).where(eq(trainingAssignments.id, assignmentId)).returning();
        return updated;
      });
      return { ...changed, ...projectTimer(changed, now()) };
    } finally { await lock.query("select pg_advisory_unlock(hashtextextended($1, 0))", [key]).catch(() => {}); lock.release(); }
  }
  async function history(userId: number, beforeId?: number, limit = 50) {
    const filter = beforeId ? and(eq(trainingAssignments.userId, userId), lt(trainingAssignments.id, beforeId)) : eq(trainingAssignments.userId, userId);
    return db.select({ assignment: trainingAssignments, name: cfProblems.name, url: cfProblems.url })
      .from(trainingAssignments).innerJoin(cfProblems, eq(trainingAssignments.problemKey, cfProblems.key))
      .where(filter).orderBy(desc(trainingAssignments.id)).limit(limit);
  }
  return { overview, setGoal, setDayOverride, planToday, event, history };
}
