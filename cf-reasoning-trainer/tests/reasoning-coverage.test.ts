import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { analysisJobs, analysisVersions, cfCatalogState, cfProblems, problemStatements, verificationResults } from "../server/db/schema";
import { createCoverageService } from "../server/reasoning/coverage";
import { Browser, testApi, testDatabase } from "./helpers";

test("coverage partitions eligible problems and excludes synthetic proof reviews", async () => {
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  const key = (rating: number | "unrated") => `c:7000:${rating}`;
  try {
    const coverage = createCoverageService(pool);
    const empty = await coverage.summary();
    assert.equal(empty.eligible, 0);
    assert.equal(empty.lastCatalogSync, null);
    for (const rating of [1199, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2001] as const) {
      await db.insert(cfProblems).values({ key: key(rating), contestId: 7000, index: String(rating), name: `Fixture ${rating}`,
        type: "PROGRAMMING", rating, inProblemset: true });
    }
    await db.insert(cfProblems).values({ key: key("unrated"), contestId: 7000, index: "unrated",
      name: "Fixture unrated", type: "PROGRAMMING", rating: null, inProblemset: true });
    const syncAt = new Date("2026-10-15T12:00:00Z");
    await db.update(cfCatalogState).set({ refreshedAt: syncAt }).where(eq(cfCatalogState.id, 1));

    async function statement(rating: number, sourceKind: "operator-approved" | "synthetic-fixture" = "operator-approved") {
      const [row] = await db.insert(problemStatements).values({ problemKey: key(rating), locale: "en", scope: "shared", ownerId: null,
        sourceKind, sourceRef: "fixture-only", grantRef: "simulated-test-grant", attribution: "Synthetic fixture, not a real rights grant",
        processingAllowed: true, sharingAllowed: true, contentHash: randomUUID().replaceAll("-", ""), content: {}, approvedAt: syncAt }).returning();
      return row;
    }
    async function job(statementId: string, status: "queued" | "running" | "completed" | "failed" | "blocked") {
      const [row] = await db.insert(analysisJobs).values({ statementId, analysisKey: randomUUID().replaceAll("-", ""),
        status, mode: "live", tier: "standard", modelId: "mock", promptVersion: "fixture", promptHash: "fixture",
        schemaVersion: "fixture", maxAttempts: 2 }).returning();
      return row;
    }
    async function version(statementId: string, problemKey: string, status: "tested" | "proof-reviewed" | "disputed") {
      const record = await job(statementId, "completed");
      const [row] = await db.insert(analysisVersions).values({ jobId: record.id, statementId, problemKey,
        candidateHash: randomUUID().replaceAll("-", ""), candidate: { disposition: "complete" }, status,
        uncertainty: [] }).returning();
      return row;
    }
    const synthetic = await statement(1200, "synthetic-fixture");
    const fakeReview = await version(synthetic.id, key(1200), "proof-reviewed");
    await db.insert(verificationResults).values({ analysisId: fakeReview.id, method: "human-proof-review", outcome: "pass",
      scope: "Synthetic test only", evidence: {}, actorRef: "fixture" });
    await statement(1300);
    const queued = await statement(1400); await job(queued.id, "queued");
    const running = await statement(1500); await job(running.id, "running");
    const review = await statement(1600); await version(review.id, key(1600), "tested");
    const proven = await statement(1700); const realReview = await version(proven.id, key(1700), "proof-reviewed");
    await db.insert(verificationResults).values([
      { analysisId: realReview.id, method: "sample", outcome: "pass", scope: "Fixture predictions", evidence: {}, actorRef: "fixture" },
      { analysisId: realReview.id, method: "independent-critique", outcome: "inconclusive", scope: "Fixture critique", evidence: {}, actorRef: "fixture" },
    ]);
    await db.insert(verificationResults).values({ analysisId: realReview.id, method: "human-proof-review", outcome: "pass",
      scope: "Simulated proof review fixture", evidence: {}, actorRef: "fixture" });
    const failed = await statement(1800); await job(failed.id, "failed");
    const blocked = await statement(1900); await job(blocked.id, "blocked");
    const disputed = await statement(2000); await version(disputed.id, key(2000), "disputed");

    const summary = await coverage.summary();
    assert.equal(summary.cataloged, 12);
    assert.equal(summary.unrated, 1);
    assert.equal(summary.eligible, 9);
    assert.equal(summary.authorizedStatements, 8);
    assert.equal(summary.completedAnalysis, 3);
    assert.equal(summary.lastCatalogSync, syncAt.toISOString());
    assert.deepEqual(summary.stages, { awaitingStatement: 1, ready: 1, queued: 1, analyzing: 1,
      needsReview: 1, verified: 1, failed: 2, blocked: 1 });
    assert.equal(Object.values(summary.stages).reduce((sum, value) => sum + value, 0), summary.eligible);

    const plan = await coverage.plan(1);
    assert.equal(plan.mode, "dry-run");
    assert.equal(plan.candidateJobs, 1);
    assert.deepEqual(plan.page, [{ key: key(1300), rating: 1300 }]);
    assert.equal(plan.alreadyVerified, 1);
    assert.equal(plan.awaitingStatement, 1);
    assert.equal(plan.nextAfter, null);
    assert.deepEqual((await coverage.plan(1, key(1300))).page, []);

    const api = await testApi(fixture.config, fixture.database);
    try {
      assert.equal((await fetch(`${api.base}/api/reasoning/coverage`)).status, 401);
      const browser = new Browser(api.base, fixture.config.APP_ORIGIN);
      await browser.register();
      const response = await browser.request("GET", "/api/reasoning/coverage");
      assert.equal(response.status, 200);
      assert.equal(response.data.stages.verified, 1);
      assert.equal(response.text.includes("passwordHash"), false);
      assert.equal(response.text.includes("simulated-test-grant"), false);
    } finally { await api.close(); }

    const replacement = await statement(1700);
    await db.update(problemStatements).set({ createdAt: new Date(Date.now() + 1000) }).where(eq(problemStatements.id, replacement.id));
    assert.equal((await coverage.summary()).stages.verified, 0);
    assert.equal((await coverage.summary()).stages.ready, 2);
    await statement(1200); // A real registered source supersedes the synthetic-only gap.
    const firstPage = await coverage.plan(1);
    assert.equal(firstPage.candidateJobs, 3);
    assert.deepEqual(firstPage.page.map(item => item.key), [key(1200)]);
    assert.equal(firstPage.nextAfter, key(1200));
    const secondPage = await coverage.plan(1, firstPage.nextAfter!);
    assert.deepEqual(secondPage.page.map(item => item.key), [key(1300)]);
  } finally { await fixture.close(); }
});
