import assert from "node:assert/strict";
import { test } from "node:test";
import { createCodeforcesClient, CodeforcesError, type CodeforcesClient } from "../server/codeforces/client";
import { createCatalogService } from "../server/codeforces/catalog";
import { createProfileService } from "../server/codeforces/profile";
import { cfProblems, users } from "../server/db/schema";
import { eq } from "drizzle-orm";
import { testDatabase } from "./helpers";

const problem = (contestId: number, index: string, rating?: number) => ({ contestId, index, name: `Problem ${index}`, type: "PROGRAMMING", ...(rating === undefined ? {} : { rating }) });
const submission = (id: number, rating: number | undefined, verdict: string, participantType = "CONTESTANT", contestId = 100) => ({
  id, contestId, creationTimeSeconds: 1_700_000_000 + id * 60, relativeTimeSeconds: id * 60,
  problem: problem(contestId, "A", rating), author: { contestId, participantType },
  programmingLanguage: "C++", verdict, testset: "TESTS", passedTestCount: 1, timeConsumedMillis: 10, memoryConsumedBytes: 1024,
});
const contest = { id: 100, name: "Fixture Round", type: "CF", phase: "FINISHED", durationSeconds: 7200, startTimeSeconds: 1_700_000_000 };
const rating = { contestId: 100, contestName: "Fixture Round", handle: "Fixture", rank: 9, ratingUpdateTimeSeconds: 1_700_010_000, oldRating: 1200, newRating: 1250 };

test("official API client retries, caches, validates failures and never asks for source code", async () => {
  let calls = 0, slots = 0;
  const urls: string[] = [];
  const client = createCodeforcesClient({ gate: { async acquire() { slots++; }, async defer() {} }, sleep: async () => {},
    fetchImpl: async url => { urls.push(String(url)); calls++; return new Response(JSON.stringify(calls === 1
      ? { status: "FAILED", comment: "Call limit exceeded" }
      : { status: "OK", result: { problems: [problem(100, "A", 1200)], problemStatistics: [{ contestId: 100, index: "A", solvedCount: 20 }] } }), { status: 200 }); } });
  await client.problemset(); await client.problemset();
  assert.equal(calls, 2); assert.equal(slots, 2);
  assert(urls.every(url => url.startsWith("https://codeforces.com/api/") && !url.includes("includeSources")));
  const missing = createCodeforcesClient({ gate: { async acquire() {}, async defer() {} }, sleep: async () => {},
    fetchImpl: async () => new Response(JSON.stringify({ status: "FAILED", comment: "handle not found" })) });
  await assert.rejects(() => missing.user("Missing"), (error: unknown) => error instanceof CodeforcesError && error.code === "not_found");
});

test("user.status requests use one-based pages and preserve repeated attempts", async () => {
  const seen: string[] = [];
  const client = createCodeforcesClient({ gate: { async acquire() {}, async defer() {} }, sleep: async () => {},
    fetchImpl: async url => { seen.push(String(url)); return new Response(JSON.stringify({ status: "OK", result: [submission(2, 1500, "WRONG_ANSWER"), submission(1, 1500, "OK")] })); } });
  assert.equal((await client.submissions("Fixture", 1, 1000)).length, 2);
  assert.equal((await client.submissions("Fixture", 1001, 1000)).length, 2);
  assert(seen[0].includes("from=1") && seen[1].includes("from=1001"));
  assert(seen.every(url => !url.includes("includeSources")));
});

test("catalog filtering, pagination, repeated sync, changed ratings and private history", async () => {
  const fixture = await testDatabase();
  try {
    const { db, pool } = fixture.database;
    const [accountA] = await db.insert(users).values({ username: "fixture_a", name: "A", email: "a@example.invalid", passwordHash: "unused" }).returning();
    const [accountB] = await db.insert(users).values({ username: "fixture_b", name: "B", email: "b@example.invalid", passwordHash: "unused" }).returning();
    let currentRating = 1200, failure = false, failStatus = false, statusCalls = 0;
    const all = [submission(4, 2400, "OK", "PRACTICE"), submission(3, 1200, "OK"), submission(2, 1200, "WRONG_ANSWER"), submission(1, undefined, "WRONG_ANSWER")];
    all[0].problem.index = "C"; all[3].problem.index = "B";
    const fake = { async problemset() { if (failure) throw new CodeforcesError("unavailable", 503); return {
      problems: [problem(100, "A", currentRating), problem(100, "A", currentRating), problem(100, "B", 2000), problem(100, "C", 1199), problem(100, "D", 2001), problem(100, "E")],
      problemStatistics: [{ contestId: 100, index: "A", solvedCount: 22 }] }; },
      async contests() { return [contest]; }, async user() { return [{ handle: "Fixture", rating: 1250, maxRating: 1300 }]; },
      async ratings() { return [rating]; },
      async submissions(_handle: string, from: number) { statusCalls++; if (failStatus) throw new CodeforcesError("unavailable", 503); return from === 1 ? [...all, all[0]] : []; },
    } as CodeforcesClient;
    const catalog = createCatalogService(db, pool, fake);
    const profiles = createProfileService(db, pool, fake);
    const first = await catalog.refresh(true);
    assert.equal(first.eligible, 2); assert.equal(first.unrated, 1);
    assert.equal(first.total, 5);
    assert.equal((await catalog.list()).length, 2);
    const own = await profiles.sync(accountA.id, "Fixture");
    assert.equal(own?.submissionCount, 4);
    assert.equal(own?.analytics.acceptedAfterFailed, 1);
    assert.equal(own?.analytics.acceptedFirstAttempt, 1);
    assert.equal(own?.analytics.attemptedUnsolved, 1);
    assert.equal(own?.analytics.ratedContestCount, 1);
    assert.equal(own?.contestParticipation.find(item => item.participantType === "CONTESTANT")?.firstAcceptedFromContestStartSeconds, 180);
    assert.equal((await profiles.submissionsPage(accountA.id)).find(s => s.problemRating === 2400)?.id, 4);
    assert.equal(await profiles.snapshot(accountB.id), null);
    assert.deepEqual(await profiles.submissionsPage(accountB.id), []);
    await profiles.sync(accountA.id, "Fixture");
    assert.equal((await profiles.snapshot(accountA.id))?.submissionCount, 4);
    assert(statusCalls >= 2);
    failStatus = true;
    await assert.rejects(() => profiles.sync(accountA.id, "Fixture"));
    assert.equal((await profiles.snapshot(accountA.id))?.submissionCount, 4);
    assert.equal((await profiles.snapshot(accountA.id))?.lastError, "sync_failed");
    failStatus = false;
    currentRating = 1400;
    await catalog.refresh(true);
    const [updated] = await db.select().from(cfProblems).where(eq(cfProblems.key, "c:100:A"));
    assert.equal(updated.rating, 1400);
    failure = true;
    await assert.rejects(() => catalog.refresh(true));
    assert.equal((await catalog.summary()).eligible, 2);
    assert.equal((await catalog.summary()).lastError, "refresh_failed");
    const pages: number[] = [];
    const longHistory = Array.from({ length: 1001 }, (_, i) => submission(2000 - i, 900, "WRONG_ANSWER", "PRACTICE"));
    const paged = { ...fake, async submissions(_handle: string, from: number) {
      pages.push(from); return longHistory.slice(from - 1, from - 1 + 1000);
    } } as CodeforcesClient;
    const otherProfiles = createProfileService(db, pool, paged);
    const imported = await otherProfiles.sync(accountB.id, "Fixture");
    assert.deepEqual(pages, [1, 1001]);
    assert.equal(imported?.submissionCount, 1001);
    assert.equal((await profiles.snapshot(accountA.id))?.submissionCount, 4);
  } finally { await fixture.close(); }
});
