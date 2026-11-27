import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { bandPerformance, capacityForDay, localDay, recommendDay, type Candidate, type PastAssignment } from "../server/training/planner";
import { applyTimerEvent, projectTimer, type AssignmentRow } from "../server/training/timer";
import { createTrainingService } from "../server/training/service";
import { cfProblems, cfProfiles, users } from "../server/db/schema";
import type { GoalInput } from "../shared/training";
import { testDatabase } from "./helpers";

const goal: GoalInput = { targetRating: 2000, deadline: "2026-12-31", dailyMinutes: 60,
  trainingDays: [1, 2, 3, 4, 5], intensity: "standard", focus: "balanced", progression: "strict-band", timeZone: "Asia/Kolkata" };
const candidate = (key: string, rating = 1200): Candidate => ({ key, rating, name: key, url: `https://codeforces.com/problemset/problem/100/${key}`,
  contestStartAt: new Date("2026-09-01T00:00:00Z"), solvedCount: 100 });
const attempt = (id: number, band: number, key: string, day = "2026-10-12", overrides: Partial<PastAssignment> = {}): PastAssignment => ({
  id, problemKey: key, day, rating: band, status: "completed", outcome: "solved", independent: true,
  hintUsed: false, editorialUsed: false, plannedMinutes: 30, thinkingBudgetMinutes: 20,
  thinkingMs: 600_000, implementationMs: 300_000, pausedMs: 0, observation: null,
  firstObservationAt: null, firstObservationThinkingMs: null, priority: 1, ...overrides,
});

test("local dates, weekends, rest overrides and deadline boundaries are deterministic", () => {
  assert.equal(localDay(new Date("2026-10-12T19:00:00Z"), "Asia/Kolkata"), "2026-10-13");
  assert.equal(localDay(new Date("2026-10-12T19:00:00Z"), "America/Los_Angeles"), "2026-10-12");
  assert.equal(capacityForDay(goal, "2026-10-17"), 0); // Saturday
  assert.equal(capacityForDay(goal, "2026-10-17", { minutes: 30 }), 30);
  assert.equal(capacityForDay(goal, "2026-10-19", { minutes: 0 }), 0);
  assert.equal(capacityForDay(goal, "2027-01-01"), 0);
});

test("missed days and overflow preserve only bounded carry work within capacity", () => {
  const old = [1, 2, 3].map(id => attempt(id, 1200, `old-${id}`, "2026-10-12", { status: "unfinished", outcome: "unfinished", independent: null, plannedMinutes: 30 }));
  const result = recommendDay({ goal: { ...goal, dailyMinutes: 30 }, day: "2026-10-15", currentRating: 1200,
    candidates: [...old.map(item => candidate(item.problemKey)), candidate("new")], history: old,
    cfSolved: new Set(), cfAttempted: new Set() });
  assert(result.assignments.length <= 2);
  assert.equal(result.deferredKeys.length, 1);
  assert(result.assignments.reduce((sum, item) => sum + item.plannedMinutes, 0) <= result.targetMinutes);
  assert(result.targetMinutes <= result.capacityMinutes);
});

test("solved, out-of-band and unavailable problems never become new assignments", () => {
  const base = { goal, day: "2026-10-13", currentRating: 1200, history: [] as PastAssignment[], cfAttempted: new Set<string>() };
  const none = recommendDay({ ...base, candidates: [candidate("hard", 1900), candidate("solved")], cfSolved: new Set(["solved"]) });
  assert.equal(none.assignments.length, 0); assert.equal(none.reason, "no_eligible_problems");
  const eligible = recommendDay({ ...base, candidates: [candidate("easy"), candidate("solved")], cfSolved: new Set(["solved"]) });
  assert.deepEqual(eligible.assignments.map(item => item.problemKey), ["easy"]);
});

test("recent unsuccessful independent work reduces the next workload without raising difficulty", () => {
  const input = { goal, day: "2026-10-16", currentRating: 1200, candidates: [candidate("fresh")],
    cfSolved: new Set<string>(), cfAttempted: new Set<string>() };
  const baseline = recommendDay({ ...input, history: [] });
  const struggling = recommendDay({ ...input, history: [1, 2, 3].map(id => attempt(id, 1200, `failed-${id}`, "2026-10-14",
    { status: "completed", outcome: "unsolved", independent: false })) });
  assert(struggling.targetMinutes < baseline.targetMinutes);
  assert(struggling.assignments.every(item => item.rating < 1300));
});

test("band progression requires independent unique successes and adequate speed at every band", () => {
  const repeated = [1, 2, 3].map(id => attempt(id, 1200, "same"));
  assert.equal(bandPerformance(repeated, 1200, 2000).currentBand, 1200);
  const all: PastAssignment[] = [];
  for (let band = 1200; band < 2000; band += 100) for (let i = 0; i < 3; i++) all.push(attempt(all.length + 1, band, `${band}-${i}`));
  const ready = bandPerformance(all, 1200, 2000);
  assert.equal(ready.currentBand, 2000); assert.equal(ready.estimatedReadiness, 2000);
  const slow = all.map(item => item.rating === 1500 ? { ...item, thinkingMs: 2_400_000 } : item);
  assert.equal(bandPerformance(slow, 1200, 2000).currentBand, 1500);
});

test("timer pause/resume, observation, implementation and self-reported outcome accumulate exact segments", () => {
  const time = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000);
  let row = { status: "pending", segmentStartedAt: null, thinkingMs: 0, pausedMs: 0, implementationMs: 0,
    observation: null, firstObservationAt: null, firstObservationThinkingMs: null, hintUsed: false, editorialUsed: false,
    outcome: null, independent: null } as AssignmentRow;
  assert.throws(() => applyTimerEvent(row, { type: "finish", outcome: "solved", independent: true }, time(0)));
  row = { ...row, ...applyTimerEvent(row, { type: "start" }, time(0)) };
  assert.equal(projectTimer(row, time(30)).thinkingMs, 30_000);
  row = { ...row, ...applyTimerEvent(row, { type: "observation", text: "Invariant found" }, time(30)) };
  assert.equal(row.firstObservationThinkingMs, 30_000);
  row = { ...row, ...applyTimerEvent(row, { type: "pause" }, time(40)) };
  row = { ...row, ...applyTimerEvent(row, { type: "resume" }, time(70)) };
  row = { ...row, ...applyTimerEvent(row, { type: "implement" }, time(90)) };
  row = { ...row, ...applyTimerEvent(row, { type: "finish", outcome: "solved", independent: true }, time(120)) };
  assert.deepEqual([row.thinkingMs, row.pausedMs, row.implementationMs], [60_000, 30_000, 30_000]);
  assert.equal(row.status, "completed"); assert.equal(row.independent, true);
  assert.deepEqual(applyTimerEvent(row, { type: "finish", outcome: "solved", independent: true }, time(121)), {});
  const assisted = { ...row, status: "thinking", hintUsed: true, segmentStartedAt: time(120) };
  assert.throws(() => applyTimerEvent(assisted, { type: "finish", outcome: "solved", independent: true }, time(130)));
});

test("private plans persist, adapt to less time and reject another user's timer access", async () => {
  const fixture = await testDatabase();
  try {
    const { db, pool } = fixture.database;
    const [a] = await db.insert(users).values({ username: "trainer_a", name: "A", email: "trainer-a@example.invalid", passwordHash: "unused" }).returning();
    const [b] = await db.insert(users).values({ username: "trainer_b", name: "B", email: "trainer-b@example.invalid", passwordHash: "unused" }).returning();
    await db.insert(cfProfiles).values({ userId: a.id, handle: "Fixture", handleLower: "fixture", active: true, rating: 1200 });
    await db.insert(cfProblems).values(Array.from({ length: 5 }, (_, i) => ({ key: `c:100:${String.fromCharCode(65 + i)}`, contestId: 100,
      index: String.fromCharCode(65 + i), name: `Problem ${i}`, type: "PROGRAMMING", rating: 1200,
      url: `https://codeforces.com/problemset/problem/100/${String.fromCharCode(65 + i)}`, inProblemset: true })));
    let clock = new Date("2026-10-13T04:00:00Z");
    const service = createTrainingService(db, pool, () => clock);
    await service.setGoal(a.id, goal);
    await service.setGoal(b.id, goal);
    const first = await service.planToday(a.id);
    assert(first.today?.assignments.length);
    assert(first.today!.reservedMinutes <= first.today!.capacityMinutes);
    const assignmentId = first.today!.assignments[0].id;
    await assert.rejects(() => service.event(b.id, assignmentId, { type: "start" }), { status: 404 });
    assert.deepEqual(await service.history(b.id), []);
    await service.setDayOverride(a.id, { day: "2026-10-13", kind: "recovery", minutes: 20 });
    const reduced = await service.overview(a.id);
    assert.equal(reduced.today?.capacityMinutes, 20);
    assert(reduced.today!.reservedMinutes <= 20);
    assert.equal(reduced.today?.overCapacity, false);
    await service.setDayOverride(a.id, { day: "2026-10-13", kind: "break", minutes: 0 });
    assert.equal((await service.overview(a.id)).today?.reservedMinutes, 0);
    await service.setDayOverride(a.id, { day: "2026-10-13", kind: "custom", minutes: 20 });
    assert((await service.overview(a.id)).today?.assignments.some(item => item.status === "pending"));
    const active = reduced.today!.assignments.find(item => item.status === "pending");
    assert(active);
    await service.event(a.id, active.id, { type: "start" });
    clock = new Date(clock.getTime() + 30_000);
    await service.event(a.id, active.id, { type: "pause" });
    const paused = await service.overview(a.id);
    assert.equal(paused.today?.assignments.find(item => item.id === active.id)?.thinkingMs, 30_000);
    await service.setDayOverride(a.id, { day: "2026-10-13", kind: "break", minutes: 0 });
    assert.equal((await service.overview(a.id)).today?.overCapacity, true);
    clock = new Date("2026-10-14T04:00:00Z");
    const next = await service.planToday(a.id);
    assert(next.today?.assignments.some(item => item.carryFromId === active.id));
    assert((await service.history(a.id)).some(item => item.assignment.id === active.id && item.assignment.status === "rescheduled"));
    assert(next.today!.reservedMinutes <= next.today!.capacityMinutes);
    await service.setGoal(a.id, { ...goal, dailyMinutes: 20 });
    assert((await service.overview(a.id)).today!.reservedMinutes <= 20);
    clock = new Date("2026-10-22T04:00:00Z");
    assert.equal((await service.overview(a.id)).progress?.assessment, "behind");
  } finally { await fixture.close(); }
});
