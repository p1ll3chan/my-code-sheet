import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { cfProblems, analysisJobs, analysisVersions, modelUsage, problemStatements, users, verificationResults } from "../server/db/schema";
import { createReasoningService } from "../server/reasoning/service";
import { mockAdapter, type ModelCall, type ModelAdapter } from "../server/reasoning/model";
import { analysisOutputJsonSchema } from "../server/reasoning/structured-output";
import { testApi, testDatabase, Browser } from "./helpers";
import type { AnalysisCandidate } from "../docs/design/reasoning-contracts";
import type { Config } from "../server/config";

import { candidate, scriptedModel, source } from "./reasoning-fixtures";

test("Phase 4B fixture pipeline: eligibility, persistence, verification, retries, budget and retrieval", async t => {
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  const key = (rating: number) => `c:9000:${rating}`;
  try {
    for (const rating of [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100]) {
      await db.insert(cfProblems).values({ key: key(rating), contestId: 9000, index: String(rating), name: `Synthetic ${rating}`,
        type: "PROGRAMMING", rating, inProblemset: true, url: `https://example.invalid/${rating}` });
    }
    await db.insert(cfProblems).values({ key: "c:9000:unrated", contestId: 9000, index: "unrated", name: "Synthetic unrated",
      type: "PROGRAMMING", rating: null, inProblemset: true });
    const primary = scriptedModel();
    const service = createReasoningService(db, pool, fixture.config, primary.model);

    await t.test("rating boundaries and missing/invalid statements are explicit", async () => {
      assert.deepEqual(await service.enqueue(key(1100)), { status: "ineligible" });
      assert.deepEqual(await service.enqueue(key(2100)), { status: "ineligible" });
      assert.deepEqual(await service.enqueue("c:9000:unrated"), { status: "ineligible" });
      assert.deepEqual(await service.enqueue(key(1200)), { status: "missing_statement" });
      await assert.rejects(service.registerStatement({ ...source(key(1200)), constraints: [] }));
      await assert.rejects(service.registerStatement({ ...source(key(1200)), tags: ["math"] }));
      await assert.rejects(service.registerStatement({ ...source(key(1200)), processingAllowed: false }));
      assert.equal((await service.registerStatement(source(key(1200)))).problemKey, key(1200));
      assert.equal((await service.registerStatement(source(key(2000)))).problemKey, key(2000));
    });

    await t.test("private source records cannot enter a shared job", async () => {
      const [owner] = await db.insert(users).values({ username: "sourceowner", name: "Source Owner", email: "source@example.invalid",
        passwordHash: "synthetic-test-only" }).returning();
      await service.registerStatement({ ...source(key(1800)), scope: "private", ownerId: owner.id, sharingAllowed: false });
      assert.deepEqual(await service.enqueue(key(1800)), { status: "missing_statement" });
    });

    await t.test("one job per version, complete mock flow, human gate, concept retrieval and account authentication", async () => {
      const jobs = await Promise.all([service.enqueue(key(1200)), service.enqueue(key(1200))]);
      assert.equal(jobs[0].jobId, jobs[1].jobId);
      const running = await service.runOne();
      assert.equal(running?.status, "completed");
      assert.equal(primary.calls(), 4);
      const [version] = await db.select().from(analysisVersions).where(eq(analysisVersions.jobId, jobs[0].jobId!));
      assert.equal(version.status, "tested");
      const evidence = await db.select().from(verificationResults).where(eq(verificationResults.analysisId, version.id));
      assert.deepEqual(new Set(evidence.map(item => item.method)), new Set(["sample", "blind-derivation", "independent-critique"]));
      assert.equal((await service.enqueue(key(1200))).cached, true);
      assert.equal(primary.calls(), 4);
      assert.equal(await service.byProblem(key(1200)), null);
      await service.reviewProof(version.id, { reviewerRef: "synthetic-reviewer", proofAccepted: true, bottlenecksAccepted: true, rationale: "Synthetic contract exercise; not a real mathematical review." });
      await service.addConcept({ id: "discovery.identity", facet: "primary-discovery", label: "Identity", definition: "Output already equals input.", reviewerRef: "synthetic-reviewer" });
      await service.addConcept({ id: "skill.check-output", facet: "transferable-skill", label: "Check output", definition: "Compare input and output.", reviewerRef: "synthetic-reviewer" });
      await service.relateConcepts("discovery.identity", "skill.check-output", "related", "synthetic-reviewer");
      await service.mapProblemConcept(version.id, "discovery.identity", "o1", "synthetic-reviewer");
      assert.deepEqual(await service.byConcept("discovery.identity"), [key(1200)]);
      assert.equal((await service.byProblem(key(1200)))?.analysisId, version.id);
      const api = await testApi(fixture.config, fixture.database);
      try {
        assert.equal((await fetch(`${api.base}/api/reasoning/problems/${encodeURIComponent(key(1200))}`)).status, 401);
        const browser = new Browser(api.base, fixture.config.APP_ORIGIN);
        assert.equal((await browser.register()).response.status, 201);
        const visible = await browser.request("GET", `/api/reasoning/problems/${encodeURIComponent(key(1200))}`);
        assert.equal(visible.status, 200);
        assert.equal(visible.data?.analysisId, version.id);
        assert.equal(visible.text.includes("passwordHash"), false);
      } finally { await api.close(); }
      await db.update(cfProblems).set({ rating: 2100 }).where(eq(cfProblems.key, key(1200)));
      assert.equal(await service.byProblem(key(1200)), null);
      assert.deepEqual(await service.byConcept("discovery.identity"), []);
    });

    await t.test("changed statement creates a new version rather than replacing the old one", async () => {
      await db.update(cfProblems).set({ rating: 1200 }).where(eq(cfProblems.key, key(1200)));
      const statement = await service.registerStatement(source(key(1200), "Version two."));
      await db.update(problemStatements).set({ createdAt: new Date(Date.now() + 1000) }).where(eq(problemStatements.id, statement.id));
      const next = await service.enqueue(key(1200));
      assert.equal(next.cached, false);
      assert.equal((await service.runOne())?.status, "completed");
      const versions = await db.select().from(analysisVersions).where(eq(analysisVersions.problemKey, key(1200)));
      assert.equal(versions.length, 2);
      assert.equal(await service.byProblem(key(1200)), null);
      assert.deepEqual(await service.byConcept("discovery.identity"), []);
    });

    await t.test("failed samples and contradicted conclusions stay unavailable", async () => {
      for (const [rating, options] of [[1300, { wrongSample: true }], [1400, { contradict: true }]] as const) {
        await service.registerStatement(source(key(rating)));
        const scripted = scriptedModel(options);
        const worker = createReasoningService(db, pool, fixture.config, scripted.model);
        const queued = await worker.enqueue(key(rating));
        assert.equal((await worker.runOne())?.status, "completed");
        const [version] = await db.select().from(analysisVersions).where(eq(analysisVersions.jobId, queued.jobId!));
        assert.equal(version.status, "disputed");
        assert.equal(await worker.byProblem(key(rating)), null);
      }
    });

    await t.test("invalid structured output retries only to the configured limit", async () => {
      await service.registerStatement(source(key(1500)));
      const bad = scriptedModel({ invalid: true });
      const worker = createReasoningService(db, pool, fixture.config, bad.model);
      const queued = await worker.enqueue(key(1500));
      assert.equal((await worker.runOne())?.status, "queued");
      await db.update(analysisJobs).set({ nextRunAt: new Date(0) }).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal((await worker.runOne())?.status, "failed");
      assert.equal((await worker.runOne()), null);
      assert.equal(bad.calls(), 2);
      const [job] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal(job.attempts, 2);
      assert.equal(job.errorCode, "invalid_structured_output");
    });

    await t.test("an expired lease resumes and mock calls account for zero paid usage", async () => {
      await service.registerStatement(source(key(1600)));
      const queued = await service.enqueue(key(1600));
      await db.update(analysisJobs).set({ status: "running", leaseUntil: new Date(0) }).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal((await service.runOne())?.status, "completed");
      const [spent] = await db.select({ total: sql<number>`coalesce(sum(${modelUsage.actualMicroUsd}),0)::bigint` }).from(modelUsage);
      assert.equal(Number(spent.total), 0);
      assert.equal((await db.select().from(modelUsage)).every(item => item.mode === "mock"), true);
    });

    await t.test("an exhausted expired lease becomes a terminal failure", async () => {
      const queued = await service.enqueue(key(2000));
      await db.update(analysisJobs).set({ status: "running", attempts: fixture.config.AI_MAX_ATTEMPTS,
        leaseUntil: new Date(0) }).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal(await service.runOne(), null);
      const [job] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal(job.status, "failed");
      assert.equal(job.errorCode, "lease_attempt_limit");
    });

    await t.test("a simulated live adapter cannot cross the global spending cap", async () => {
      await service.registerStatement({ ...source(key(1700)), sourceKind: "operator-approved", grantRef: "simulated-test-grant" });
      let sent = 0;
      const fakeLive: ModelAdapter = { mode: "live", available: async () => true, generate: async () => { sent++; throw new Error("Should never send"); } };
      const liveConfig: Config = { ...fixture.config, AI_ENABLED: "true", AI_DRY_RUN: "false", AI_PROVIDER: "openai", AI_SPEND_LIMIT_USD: 0.0001,
        AI_PAID_APPROVAL_ID: "synthetic-test-approval", AI_APPROVED_PROBLEM_KEYS: key(1700),
        OPENAI_STANDARD_MODEL: "synthetic-standard", OPENAI_STRONG_MODEL: "synthetic-strong", OPENAI_API_KEY: randomBytes(32).toString("hex"),
        OPENAI_STANDARD_INPUT_USD_PER_M: 100, OPENAI_STANDARD_OUTPUT_USD_PER_M: 100,
        OPENAI_STRONG_INPUT_USD_PER_M: 100, OPENAI_STRONG_OUTPUT_USD_PER_M: 100 };
      const worker = createReasoningService(db, pool, liveConfig, fakeLive);
      const queued = await worker.enqueue(key(1700));
      assert.equal((await worker.runOne())?.status, "blocked");
      assert.equal(sent, 0);
      assert.equal((await db.select().from(modelUsage).where(eq(modelUsage.jobId, queued.jobId!))).length, 0);
    });

    await t.test("an interrupted live reservation is blocked before replay", async () => {
      await service.registerStatement({ ...source(key(1900), "Live lease."), sourceKind: "operator-approved", grantRef: "simulated-test-grant" });
      let sent = 0;
      const fakeLive: ModelAdapter = { mode: "live", available: async () => true, generate: async () => { sent++; throw new Error("Must not replay"); } };
      const liveConfig: Config = { ...fixture.config, AI_ENABLED: "true", AI_DRY_RUN: "false", AI_PROVIDER: "openai", AI_SPEND_LIMIT_USD: 10,
        AI_PAID_APPROVAL_ID: "synthetic-test-approval", AI_APPROVED_PROBLEM_KEYS: key(1900),
        OPENAI_STANDARD_MODEL: "synthetic-standard", OPENAI_STRONG_MODEL: "synthetic-strong", OPENAI_API_KEY: randomBytes(32).toString("hex"),
        OPENAI_STANDARD_INPUT_USD_PER_M: 1, OPENAI_STANDARD_OUTPUT_USD_PER_M: 1,
        OPENAI_STRONG_INPUT_USD_PER_M: 1, OPENAI_STRONG_OUTPUT_USD_PER_M: 1 };
      const worker = createReasoningService(db, pool, liveConfig, fakeLive);
      const queued = await worker.enqueue(key(1900));
      await db.insert(modelUsage).values({ jobId: queued.jobId!, role: "analysis", mode: "live", modelId: "synthetic-strong",
        promptVersion: "primary-analysis/0.2", promptHash: "synthetic-test-hash", inputHash: "synthetic-test-input",
        status: "reserved", reservedMicroUsd: 100 });
      await db.update(analysisJobs).set({ status: "running", attempts: 1, leaseUntil: new Date(0) }).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal((await worker.runOne())?.status, "blocked");
      assert.equal(sent, 0);
      const [job] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, queued.jobId!));
      assert.equal(job.errorCode, "paid_call_reconciliation_required");
    });

    await t.test("structured provider schema requires all fields and rejects arbitrary extras", () => {
      assert.equal(analysisOutputJsonSchema.type, "object");
      assert.equal(analysisOutputJsonSchema.additionalProperties, false);
      assert.deepEqual(analysisOutputJsonSchema.required, ["candidate", "samplePredictions"]);
    });
  } finally { await fixture.close(); }
});
