import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { cfProblems, cfContests, analysisJobs, analysisVersions, problemStatements } from "../server/db/schema";
import { testDatabase } from "./helpers";
import { scriptedModel, source } from "./reasoning-fixtures";
import { createReasoningService } from "../server/reasoning/service";
import { createKnowledgeService } from "../server/reasoning/knowledge";
import { createVerificationService, type VerificationHarness } from "../server/reasoning/verification";
import { createBackfillService } from "../server/reasoning/backfill";
import { createCoverageService } from "../server/reasoning/coverage";
import { ModelFailure } from "../server/reasoning/model";
import type { Program } from "../server/reasoning/evaluation/contracts";

const identity: Program = { language: "bounded-json/1", instructions: [
  { op: "const", args: [1], value: 0 }, { op: "get", args: [2, 0, 1], value: null }, { op: "return", args: [2], value: null } ] };
test("Phase 4 fixture E2E: staged analysis, executed verification, training retrieval and durable backfill", async t => {
  const fixture = await testDatabase(); const { db, pool } = fixture.database;
  try {
    const scripted = scriptedModel(); const seen: string[] = [];
    const model = { ...scripted.model, async generate(call: Parameters<typeof scripted.model.generate>[0]) {
      seen.push(call.role);
      if (call.role === "analysis") {
        const input = JSON.parse(call.input);
        assert.deepEqual(Object.keys(input).sort(), ["schemaVersion", "statementVersionRef", "contentHash", "locale", "statement", "inputSpecification", "outputSpecification", "constraints", "examples"].sort());
        assert.equal(call.input.includes("forbidden-tag"), false);
      }
      if (call.role === "classification") assert.ok(JSON.parse(call.input).frozenMathematics.proof);
      return scripted.model.generate(call);
    } };
    const worker = createReasoningService(db, pool, fixture.config, model);
    const verifier = createVerificationService(pool);
    const knowledge = createKnowledgeService(pool, { fixtureMode: true, environment: "test" });
    const real = createKnowledgeService(pool);
    const backfill = createBackfillService(pool, fixture.config, worker);
    await db.insert(cfContests).values({ id: 9990, name: "Synthetic fixture contest", phase: "FINISHED", type: "CF", durationSeconds: 7200, startAt: new Date("2026-01-01Z") });
    for (const [index, rating] of [["A",1200],["B",1300],["C",1400],["D",2000],["E",2100],["F",1500]] as const) {
      await db.insert(cfProblems).values({ key: `c:9990:${index}`, contestId: 9990, index, rating, name: `Synthetic fixture ${index}`, type: "PROGRAMMING", inProblemset: true });
    }
    const sources = new Map<string, { id: string; contentHash: string }>();
    for (const index of ["A", "B", "C", "D"]) sources.set(index, await worker.registerStatement(source(`c:9990:${index}`)));
    const harness = (index: string): VerificationHarness => ({ id: "original-identity", version: "1", statementHash: sources.get(index)!.contentHash,
      domain: "All integers 0 through 100, exhaustive for this synthetic statement", parseSample: input => [Number(input.trim())], parseOutput: output => Number(output.trim()),
      cases: Array.from({ length: 101 }, (_, x) => [x]), oracle: input => input[0] });
    let versionA = "";
    await t.test("end-to-end A/B records have independent proof/training review and actual program evidence", async () => {
      for (const index of ["A", "B"]) {
        const queued = await worker.enqueue(`c:9990:${index}`);
        assert.equal((await worker.runOne(queued.jobId))?.status, "completed");
        const [v] = await db.select().from(analysisVersions).where(eq(analysisVersions.jobId, queued.jobId!));
        if (index === "A") versionA = v.id;
        assert.equal(await knowledge.fingerprint(v.problemKey), null);
        await worker.reviewProof(v.id, { reviewerRef: "fixture-proof-author", proofAccepted: true, bottlenecksAccepted: true, rationale: "Identity prints exactly x for every legal x; synthetic test review." });
        for (const [id, facet] of [["discovery.identity", "primary-discovery"], ["prerequisite.integer", "prerequisite"], ["skill.output", "transferable-skill"]]) {
          await worker.addConcept({ id, facet, label: id, definition: "Synthetic contract concept", reviewerRef: "fixture-taxonomy-reviewer" });
          await worker.mapProblemConcept(v.id, id, "o1", "fixture-taxonomy-reviewer", 80);
        }
        await worker.relateConcepts("prerequisite.integer", "discovery.identity", "prerequisite", "fixture-taxonomy-reviewer");
        const review = { reviewerRef: "fixture-education-author", rationale: "Review fixture: implementation exactly prints x and teaches output-condition inspection.", programMatchesProof: true, conceptsAccepted: true, trainingAccepted: true };
        await assert.rejects(verifier.reviewTraining(v.id, review), /executed/);
        await assert.rejects(verifier.execute(v.id, identity, { ...harness(index), statementHash: "wrong" }, "fixture-harness-author"), /mismatch/);
        assert.deepEqual((await verifier.execute(v.id, identity, harness(index), "fixture-harness-author")).map(e => [e.method,e.outcome,e.executed]), [["sample-execution","pass",1],["differential-execution","pass",101]]);
        await assert.rejects(verifier.reviewTraining(v.id, { ...review, reviewerRef: "fixture-proof-author" }), /Independent/);
        await verifier.reviewTraining(v.id, review);
        assert.equal((await knowledge.fingerprint(v.problemKey))?.summary.trust, "training-ready");
        assert.equal((await worker.enqueue(v.problemKey)).cached, true);
      }
      assert.deepEqual(seen, ["analysis", "classification", "blind", "critique", "analysis", "classification", "blind", "critique"]);
      assert.equal(scripted.calls(), 8);
    });
    await t.test("retrieval contracts filter by rating, skill, prerequisites, purpose, time and identity without spoilers", async () => {
      assert.equal((await real.search()).items.length, 0);
      assert.throws(() => createKnowledgeService(pool, { fixtureMode: true, environment: "production" }));
      const found = await knowledge.search({ minRating:1200,maxRating:1200,concepts:["skill.output"], prerequisites:["prerequisite.integer"],purpose:"discovery",since:"2025-01-01T00:00:00Z" });
      assert.equal(found.items.length, 1);
      assert.equal(found.items[0].ranking.concepts[0].weight, 0.8);
      assert.equal(found.items[0].ranking.estimatedTrainingUsefulness, null);
      assert.equal(found.items[0].ranking.prerequisiteRelationships.length, 1);
      assert.equal((await knowledge.byConcept("discovery.identity")).items.length, 2);
      assert.equal((await knowledge.byPrerequisite("prerequisite.integer")).items.length, 2);
      assert.equal((await knowledge.search({ purpose:"speed" })).items.length, 0);
      assert.equal((await knowledge.search({ since:"2027-01-01T00:00:00Z" })).items.length, 0);
      assert.equal((await knowledge.search({ exclude:["c:9990:A"],identities:["c:9990:A"] })).items.length, 0);
      assert.deepEqual((await knowledge.related("c:9990:A")).map(x=>x.summary.key), ["c:9990:B"]);
      const page = await knowledge.safeCandidates({ limit:1 }); assert.equal(page.nextAfter, "c:9990:A");
      assert.equal((await knowledge.safeCandidates({ after:page.nextAfter!,limit:1 })).items[0].key, "c:9990:B");
      assert.deepEqual(Object.keys(page.items[0]).sort(), ["key","name","rating","contestId","url","analysisId","trust","sourceKind","analyzedAt"].sort());
      for (const secret of ["identity map","diagnosticQuestion","hints","discovery.identity","proof","ranking"]) assert.equal(JSON.stringify(page.items).includes(secret), false);
      assert.equal((await knowledge.problem("c:9990:E"))?.rating, 2100);
      await assert.rejects(knowledge.search({ minRating:2000,maxRating:1200 }));
    });
    await t.test("coverage excludes synthetic knowledge and dry-run does not write jobs", async () => {
      const coverage = await createCoverageService(pool).summary();
      assert.equal(coverage.eligible, 5); assert.equal(coverage.stages.awaitingStatement,5); assert.equal(coverage.trainingReady,0); assert.equal(coverage.documentedVerification,0);
      assert.equal(coverage.byRating.reduce((n,b)=>n+b.eligible,0),5);
      const before = (await db.select().from(analysisJobs)).length;
      const plan = await backfill.plan(); assert.equal(plan.items.length,2); assert.equal(plan.alreadyVerified,2); assert.equal(plan.awaitingStatements,1);
      assert.equal((await backfill.plan("live")).items.length,0);
      assert.equal((await db.select().from(analysisJobs)).length,before);
      await assert.rejects(backfill.plan("mock", { revision:"repair" }), /identities/);
    });
    await t.test("durable batches deduplicate, enforce bounds and resume without reprocessing", async () => {
      const [a,b] = await Promise.all([backfill.create("mock"),backfill.create("mock")]); assert.equal(a.batchId,b.batchId);
      await assert.rejects(backfill.run(a.batchId,2), /limit/);
      const first = await backfill.run(a.batchId); assert.equal(first?.status,"paused");
      const calls = scripted.calls();
      // Reconstruct the service to simulate a process restart.
      const resumed = createBackfillService(pool,fixture.config,worker);
      const complete = await resumed.run(a.batchId); assert.equal(complete?.status,"completed"); assert.equal(scripted.calls(),calls+4);
      assert.equal(complete?.usage.reserved_or_actual_micro_usd,"0");
      assert.ok(complete?.completedPerMinute!>0);
      await resumed.run(a.batchId); assert.equal(scripted.calls(),calls+4);
      assert.equal((await backfill.plan()).items.length,0);
      const repair = await backfill.plan("mock", { identities:["c:9990:C"], revision:"reviewed-repair-1",reason:"Explicit synthetic regression exercise", tier:"strong" });
      assert.equal(repair.items.length,1);
      assert.equal((await backfill.plan("mock", { identities:["c:9990:A"], revision:"repair", reason:"Do not replace unchanged proof" })).items.length,0);
      const changed = createBackfillService(pool,{ ...fixture.config, AI_MAX_OUTPUT_TOKENS:500 },worker);
      await assert.rejects(changed.run(a.batchId), /configuration/);
    });
    await t.test("taxonomy normalization, dependency cycles and changed concept mappings cannot silently retain training approval", async () => {
      await assert.rejects(worker.addConcept({id:"skill.duplicate",facet:"transferable-skill",label:"skill.output",definition:"Duplicate synonym",reviewerRef:"fixture"}), /Normalize/);
      await assert.rejects(worker.addConcept({id:"new.tag",facet:"miscellaneous",label:"Anything",definition:"Unsupported facet",reviewerRef:"fixture"}), /facet/);
      await assert.rejects(worker.relateConcepts("discovery.identity","prerequisite.integer","prerequisite","fixture"), /cycle/);
      await worker.addConcept({id:"skill.inspect",facet:"transferable-skill",label:"Inspect specification",definition:"Inspect required output before choosing an algorithm",reviewerRef:"fixture"});
      await worker.mapProblemConcept(versionA,"skill.inspect","o1","fixture",50);
      assert.equal(await knowledge.fingerprint("c:9990:A"),null);
      assert.equal((await knowledge.fingerprint("c:9990:A","proof-reviewed"))?.summary.trust,"proof-reviewed");
      await verifier.reviewTraining(versionA,{reviewerRef:"fixture-education-author",rationale:"Re-review synthetic concepts after the added inspected-output mapping.",programMatchesProof:true,conceptsAccepted:true,trainingAccepted:true});
      assert.equal((await knowledge.fingerprint("c:9990:A"))?.summary.trust,"training-ready");
    });
    await t.test("revocation and newly contradictory executed evidence remove trust immediately", async () => {
      await db.update(problemStatements).set({ revokedAt:new Date() }).where(eq(problemStatements.id,sources.get("B")!.id));
      assert.equal(await knowledge.fingerprint("c:9990:B"),null);
      const wrong: Program = { language:"bounded-json/1", instructions:[{ op:"const",args:[1],value:8 },{ op:"return",args:[1],value:null }] };
      assert.equal((await verifier.execute(versionA,wrong,harness("A"),"fixture-adversarial-audit"))[0].outcome,"fail");
      assert.equal(await knowledge.fingerprint("c:9990:A"),null);
      assert.equal(await worker.byProblem("c:9990:A"),null);
    });
    await t.test("live creation requires explicit approval; no API calls occur", async () => {
      await worker.registerStatement({ ...source("c:9990:F"), sourceKind:"operator-approved",grantRef:"simulated-grant-for-gate-test" });
      let calls=0;
      const live = createReasoningService(db,pool,fixture.config,{ mode:"live",generate:async()=>{ calls++; throw new Error("Must not call"); } });
      const service = createBackfillService(pool,fixture.config,live);
      assert.equal((await service.plan("live")).items.length,1);
      await assert.rejects(service.create("live")); assert.equal(calls,0);
    });
    await t.test("batch spending cap and unknown live usage fail closed before further calls", async () => {
      let calls = 0;
      const config = { ...fixture.config, AI_ENABLED:"true" as const, AI_DRY_RUN:"false" as const, AI_PROVIDER:"openai" as const, AI_BACKFILL_ENABLED:"true" as const,
        AI_SPEND_LIMIT_USD:10, AI_PAID_APPROVAL_ID:"simulated-human-approval", AI_APPROVED_PROBLEM_KEYS:"c:9990:F", OPENAI_STANDARD_MODEL:"simulated-standard", OPENAI_STRONG_MODEL:"simulated-strong",
        OPENAI_STANDARD_INPUT_USD_PER_M:1, OPENAI_STANDARD_OUTPUT_USD_PER_M:1, OPENAI_STRONG_INPUT_USD_PER_M:1, OPENAI_STRONG_OUTPUT_USD_PER_M:1 };
      const liveWorker = createReasoningService(db,pool,config,{ mode:"live",available:async()=>true,generate:async call=>{
        calls++; return { ...await scripted.model.generate(call), inputTokens:null, outputTokens:null };
      } });
      const live = createBackfillService(pool,config,liveWorker);
      const approve = (planHash:string,maxSpendUsd:number) => ({ planHash,maxSpendUsd, approvalId:config.AI_PAID_APPROVAL_ID, pilotApprovalRef:"simulated-pilot-review",
        expiresAt:new Date(Date.now()+60000).toISOString(), pricingCheckedAt:new Date().toISOString(), pricingSource:"https://example.invalid/test-prices",
        modelCompatibilityConfirmed:true, statementRightsReviewed:true });
      const plan = await live.plan("live");
      const batch = await live.create("live",{},approve(plan.planHash,0.000001));
      assert.equal((await live.run(batch.batchId))?.status,"blocked"); assert.equal(calls,0);
      const selection = { identities:["c:9990:F"],revision:"accounting-check",reason:"Exercise missing usage response handling" };
      const next = await live.plan("live",selection);
      const second = await live.create("live",selection,approve(next.planHash,10));
      const state = await live.run(second.batchId);
      assert.equal(state?.status,"blocked"); assert.equal(calls,1); assert.equal(state?.usage.unresolved_calls,1);
      assert.ok(Number(state?.usage.reserved_or_actual_micro_usd)>0);
      await live.run(second.batchId); assert.equal(calls,1);
    });
    await t.test("interrupted classification resumes the persisted derivation without repeating the solve", async () => {
      let failed = false; const roles:string[]=[];
      const flaky = { ...scripted.model,generate:async(call:Parameters<typeof scripted.model.generate>[0])=>{
        roles.push(call.role);
        if(call.role==="classification"&&!failed){ failed=true; throw new ModelFailure("simulated_interruption",true,false); }
        return scripted.model.generate(call);
      } };
      const worker2=createReasoningService(db,pool,fixture.config,flaky);
      const planner=createBackfillService(pool,fixture.config,worker2);
      const created=await planner.create("mock",{ identities:["c:9990:C"],revision:"resume-classification",reason:"Test derivation checkpoint resume" });
      assert.equal((await planner.run(created.batchId))?.status,"paused");
      const [job]=await db.select().from(analysisJobs).where(eq(analysisJobs.batchId,created.batchId));
      assert.ok(job.derivation);
      await db.update(analysisJobs).set({nextRunAt:new Date(0)}).where(eq(analysisJobs.id,job.id));
      assert.equal((await planner.run(created.batchId))?.status,"completed");
      assert.deepEqual(roles,["analysis","classification","classification","blind","critique"]);
    });
  } finally { await fixture.close(); }
});
