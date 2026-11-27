import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { benchmark, BANDS, manifest } from "../server/reasoning/evaluation/benchmark";
import { executeProgram } from "../server/reasoning/evaluation/vm";
import { evaluationMock, packetProgram, packetSolution, packetClassification } from "../server/reasoning/evaluation/mock";
import { parseClassification, rubricKeys, type EvaluationResult, type Review, type Solution } from "../server/reasoning/evaluation/contracts";
import { verify } from "../server/reasoning/evaluation/verification";
import { createPlan, requireLiveApproval, type Approval } from "../server/reasoning/evaluation/plan";
import { createEvaluationService } from "../server/reasoning/evaluation/service";
import { reviewState, summarize } from "../server/reasoning/evaluation/metrics";
import { ModelFailure, type ModelAdapter, type ModelCall } from "../server/reasoning/model";
import { evaluationCases, evaluationCalls, evaluationReviews } from "../server/db/schema";
import { testDatabase } from "./helpers";
import type { Config } from "../server/config";

const item = benchmark.find(b => b.id === "original-packet-removal-2")!;
const options = { fixtureIds: [item.id], arms: ["standard", "strong", "standard-critique", "selective"], seed: 1729 };
function review(hash: string, reviewer: string, change: Partial<Review> = {}): Review {
  return { reviewer, artifactHash: hash, rubricVersion: "math-review/1", purpose: "assessment", independent: true,
    judgments: Object.fromEntries(rubricKeys.map(k => [k, { verdict: "pass", rationale: `Synthetic test review of ${k}; not a real human judgment.` }])) as Review["judgments"],
    failures: [], notes: "Synthetic test review only", ...change };
}

test("benchmark has 45 distinct original statements, five slots per band, deterministic oracles and no invented ratings", () => {
  assert.equal(benchmark.length, 45);
  assert.equal(new Set(benchmark.map(b => b.hash)).size, 45);
  assert.equal(new Set(benchmark.map(b => b.family)).size, 15);
  for (const band of BANDS) assert.equal(benchmark.filter(b => b.stratum === band).length, 5);
  for (const b of benchmark) {
    assert.equal(b.publishedRating, null);
    assert.equal(b.sourceKind, "original-fixture");
    assert.deepEqual(b.cases(1729, 10), b.cases(1729, 10));
    for (const e of b.statement.examples) assert.equal(b.oracle(JSON.parse(e.input)), Number(e.output));
  }
  const oracle = (family: string, input: number[]) => benchmark.find(b => b.family === family && b.parameter === 2)!.oracle(input);
  assert.equal(oracle("packet-removal", [1, 1]), 0);
  assert.equal(oracle("equal-piles", [0, 4]), 4);
  assert.equal(oracle("window-toggle", [1, 1, 1]), -1);
  assert.equal(oracle("subarray-residue", [1, 1, 1]), 2);
  assert.equal(oracle("reverse-machine", [42]), 2);
  assert.equal(oracle("interval-packing", [0, 1, 2]), 2);
  assert.equal(oracle("spaced-selection", [3, 5, 3]), 6);
  assert.equal(oracle("circular-selection", [2, 2, 2]), 2);
  assert.equal(oracle("subset-residue", [1, 1]), 2);
  assert.equal(oracle("minimax-partition", [2, 1, 3]), 3);
  assert.equal(oracle("rotation-mismatch", [2, 1, 3]), 4);
  assert.equal(oracle("residue-pairs", [1, 3, 2]), 2);
  assert.equal(oracle("zero-xor-cuts", [0, 0, 0]), 2);
  assert.equal(oracle("cover-points", [0, 2, 3, 5]), 2);
  assert.equal(oracle("cancel-runs", [1, 2, 2, 1]), 0);
  assert.match(manifest().limitation, /correlated/);
});

test("bounded execution catches incorrect conclusions, failed samples, overflow and infinite loops", () => {
  assert.equal(executeProgram(packetProgram(2), [0, 2, 4]), 1);
  assert.equal(executeProgram(packetProgram(2), [1, 1]), 0);
  const correct = verify(item, packetSolution(2), 1729);
  assert.ok(correct.every(e => e.outcome === "pass"));
  assert.equal(correct.find(e => e.method === "differential")!.cases, 64);
  const wrong = packetSolution(2); wrong.program = { language: "bounded-json/1", instructions: [{ op: "const", args: [1], value: 1 }, { op: "return", args: [1], value: null }] };
  const failed = verify(item, wrong, 1729);
  assert.equal(failed[0].outcome, "fail"); assert.ok(failed[0].counterexample);
  assert.throws(() => executeProgram({ language: "bounded-json/1", instructions: [{ op: "jump", args: [0], value: null }] }, [1]), /step_limit/);
  assert.throws(() => executeProgram({ language: "bounded-json/1", instructions: [{ op: "const", args: [64], value: 1 }] }, [1]), /register_limit/);
  assert.throws(() => executeProgram({ language: "bounded-json/1", instructions: [{ op: "const", args: [1], value: Number.MAX_SAFE_INTEGER }, { op: "mul", args: [1, 1, 1], value: null }] }, [1]), /numeric_limit/);
  assert.ok(verify(item, { ...packetSolution(2), program: null }, 1729).every(e => e.outcome === "unsupported"));
});

test("classification rejects algorithm labels as discoveries, unknown concepts and dangling observations", () => {
  const solution = packetSolution(2), c = packetClassification();
  assert.doesNotThrow(() => parseClassification(c, solution));
  c.primary[0].concept = "greedy";
  assert.throws(() => parseClassification(c, solution), /Invalid taxonomy/);
  c.primary[0].concept = "invariant"; c.primary[0].observationIds = ["o99"];
  assert.throws(() => parseClassification(c, solution), /Invalid taxonomy/);
});

test("proof and educational review stay separate; disagreement and audit failure suspend acceptance", () => {
  const result: EvaluationResult = { solution: packetSolution(2), classification: packetClassification(), blind: null, critique: null,
    evidence: verify(item, packetSolution(2), 1729), failures: [], schemaValid: true, artifactHash: "a".repeat(64), escalated: false, baseline: null, verifiedBeforeReview: false };
  assert.equal(reviewState(result, []).proofReviewed, false);
  const first = review(result.artifactHash, "A"), second = review(result.artifactHash, "B");
  assert.equal(reviewState(result, [first, second]).accepted, true);
  second.judgments.proof = { verdict: "fail", rationale: "Synthetic invalid sufficiency proof." };
  second.failures = [{ kind: "invalid-proof", detail: "Synthetic missing construction." }];
  const state = reviewState(result, [first, second]);
  assert.equal(state.accepted, false); assert.equal(state.proofReviewed, false);
  assert.deepEqual(state.disagreements, ["proof"]);
  assert.equal(state.consensus.algorithm, "pass");
  const audited = review(result.artifactHash, "C", { purpose: "audit" }); audited.judgments.reasoningClassification.verdict = "fail";
  const entries = [{ id: "case", fixtureId: item.id, arm: "standard", status: "completed", result, reviews: [first, review(result.artifactHash, "B"), audited], calls: [] }];
  const metrics = summarize(entries).byArm.standard;
  assert.equal(metrics.verificationPrecision.fraction, 0);
  assert.equal(metrics.falseVerificationRate.fraction, 1);
  assert.equal(summarize([]).byArm.standard.falseVerificationRate.fraction, null);
  assert.equal(metrics.secondaryInsightAccuracy.passFractionOfAdjudicated, 1);
  assert.equal(metrics.accepted, 0);
});

test("database evaluation stages, routing, resume, blind export, reviews, duplicate prevention and zero network", async () => {
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  const seen: ModelCall[] = [], base = evaluationMock();
  const model: ModelAdapter = { mode: "mock", generate: async call => { seen.push(call); return base.generate(call); } };
  try {
    const service = createEvaluationService(db, pool, fixture.config, model);
    const run = await service.create(options);
    assert.equal((await service.create(options)).id, run.id);
    assert.equal((await service.run(run.id, 1)).processed, 1);
    assert.equal((await service.run(run.id, 50)).status, "completed");
    assert.equal((await service.run(run.id, 50)).processed, 0);
    assert.equal(seen.length, 10); // 2 standard, 2 strong, 4 critique, 2 non-escalated selective
    for (const call of seen.filter(c => c.outputFormat?.name === "math_solve" || c.outputFormat?.name === "math_blind")) {
      assert.deepEqual(Object.keys(JSON.parse(call.input)).sort(), ["constraints", "examples", "inputSpecification", "outputSpecification", "statement"]);
      assert.ok(!call.input.includes("referenceForReviewOnly")); assert.ok(!call.input.includes("stratum"));
    }
    assert.ok(seen.some(c => c.modelId === "mock-strong"));
    const rows = await db.select().from(evaluationCases).where(eq(evaluationCases.runId, run.id));
    const standard = rows.find(r => r.arm === "standard")!;
    const callsBefore = seen.length;
    // Simulate interruption after stages were persisted but before the case was frozen.
    await db.update(evaluationCases).set({ status: "running", result: null, artifactHash: null }).where(eq(evaluationCases.id, standard.id));
    assert.equal((await service.run(run.id, 1)).processed, 1);
    assert.equal(seen.length, callsBefore);
    const packet = await service.report(run.id, true) as { packets: Array<{ caseId: string; artifactHash: string }> };
    assert.equal(packet.packets.length, 4);
    assert.ok(!JSON.stringify(packet).includes("mock-strong"));
    assert.ok(!JSON.stringify(packet).includes('"arm"'));
    const hash = packet.packets.find(p => p.caseId === standard.id)!.artifactHash;
    await assert.rejects(service.review(standard.id, review("0".repeat(64), "A")), /frozen/);
    await assert.rejects(service.review(standard.id, review(hash, "Auditor", { purpose: "audit" })), /prior acceptance/);
    await service.review(standard.id, review(hash, "A")); await service.review(standard.id, review(hash, "B"));
    await assert.rejects(service.review(standard.id, review(hash, "A")), /already submitted/);
    await service.review(standard.id, review(hash, "Auditor", { purpose: "audit" }));
    assert.equal((await db.select().from(evaluationReviews)).length, 3);
    const usage = await db.select().from(evaluationCalls);
    assert.ok(usage.every(c => c.mode === "mock" && c.actualMicroUsd === 0 && c.inputTokens === 0));
    const report = await service.report(run.id) as { metrics: ReturnType<typeof summarize> };
    assert.equal(report.metrics.byArm.standard.accepted, 1);
    assert.equal(report.metrics.byArm.standard.verificationPrecision.fraction, 1);
    const realKnowledge = await db.execute(sql`select count(*)::int as n from reasoning_analysis_versions`);
    assert.equal(realKnowledge.rows[0].n, 0);
  } finally { await fixture.close(); }
});

test("selective escalation retains failed baseline; malformed output retries terminate", async () => {
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  try {
    const base = evaluationMock();
    const service = createEvaluationService(db, pool, fixture.config, { mode: "mock", async generate(call) {
      const answer = await base.generate(call);
      if (call.modelId === "mock-standard" && call.outputFormat?.name === "math_solve") {
        const s = answer.value as Solution; s.program = { language: "bounded-json/1", instructions: [{ op: "const", args: [1], value: 1 }, { op: "return", args: [1], value: null }] };
      }
      return answer;
    } });
    const run = await service.create({ ...options, arms: ["selective"] });
    await service.run(run.id, 1);
    const [row] = await db.select().from(evaluationCases).where(eq(evaluationCases.runId, run.id));
    const r = row.result as EvaluationResult;
    assert.equal(r.escalated, true);
    assert.ok(r.baseline!.evidence.some(e => e.outcome === "fail"));
    assert.ok(r.evidence.every(e => e.outcome === "pass"));
    assert.equal((await db.select().from(evaluationCalls).where(eq(evaluationCalls.caseId, row.id))).length, 6);
    let calls = 0;
    const broken = createEvaluationService(db, pool, fixture.config, { mode: "mock", async generate(call) { calls++; return { value: { bad: true }, inputTokens: 0, outputTokens: 0, responseId: null, modelId: call.modelId }; } });
    const badRun = await broken.create({ ...options, arms: ["standard"], seed: 1730 });
    assert.equal((await broken.run(badRun.id, 1)).status, "blocked");
    assert.equal(calls, fixture.config.AI_MAX_ATTEMPTS);
    await broken.run(badRun.id, 1); assert.equal(calls, fixture.config.AI_MAX_ATTEMPTS);
    const transient = createEvaluationService(db, pool, fixture.config, { mode: "mock", generate: async () => { throw new ModelFailure("mock_transient", true, false); } });
    const failedRun = await transient.create({ ...options, arms: ["standard"], seed: 1731 });
    assert.equal((await transient.run(failedRun.id, 1)).status, "blocked");
  } finally { await fixture.close(); }
});

test("live-shaped fakes enforce credentials, availability, exact approval, cost caps and accounting without network", async () => {
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  const config: Config = { ...fixture.config, AI_ENABLED: "true", AI_DRY_RUN: "false", AI_PROVIDER: "openai", OPENAI_API_KEY: "synthetic-credential",
    OPENAI_STANDARD_MODEL: "account-standard-test", OPENAI_STRONG_MODEL: "account-strong-test", AI_PAID_APPROVAL_ID: "test-approval", AI_APPROVED_PROBLEM_KEYS: item.id,
    AI_SPEND_LIMIT_USD: 10, OPENAI_STANDARD_INPUT_USD_PER_M: 1, OPENAI_STANDARD_OUTPUT_USD_PER_M: 2,
    OPENAI_STRONG_INPUT_USD_PER_M: 3, OPENAI_STRONG_OUTPUT_USD_PER_M: 4 };
  const selected = { ...options, arms: ["standard"] };
  const plan = createPlan(config, "live", selected);
  const approval: Approval = { planHash: plan.hash, approvalId: "test-approval", approvedBy: "Synthetic test", approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(), statementAuthorizationReviewed: true, modelStructuredOutputsConfirmed: true,
    pricingSource: "https://example.invalid/test-price", pricingCheckedAt: new Date().toISOString(), maxSpendMicroUsd: 1_000_000, maxCases: 1 };
  let calls = 0;
  const base = evaluationMock();
  const adapter: ModelAdapter = { mode: "live", available: async id => [config.OPENAI_STANDARD_MODEL, config.OPENAI_STRONG_MODEL].includes(id), async generate(call) {
    calls++; return { ...await base.generate(call), inputTokens: 10, outputTokens: 5 };
  } };
  try {
    assert.throws(() => requireLiveApproval({ ...config, OPENAI_API_KEY: undefined }, plan, approval), /credentials/);
    assert.throws(() => requireLiveApproval(config, plan, { ...approval, planHash: "0".repeat(64) }), /Approval/);
    const unavailable = createEvaluationService(db, pool, config, { ...adapter, available: async () => false });
    const unavailableRun = await unavailable.create(selected, approval);
    await assert.rejects(unavailable.run(unavailableRun.id, 1), /unavailable/); assert.equal(calls, 0);
    const service = createEvaluationService(db, pool, config, adapter);
    await service.run(unavailableRun.id, 1);
    assert.equal(calls, 2);
    const report = await service.report(unavailableRun.id) as { metrics: ReturnType<typeof summarize> };
    assert.equal(report.metrics.byArm.standard.actualMicroUsd, 40); // 2*(10*1+5*2) microUSD
    const limited = { ...selected, seed: 1735 }, limitedPlan = createPlan(config, "live", limited);
    const limitedRun = await service.create(limited, { ...approval, planHash: limitedPlan.hash, maxSpendMicroUsd: 1 });
    assert.equal((await service.run(limitedRun.id, 1)).status, "blocked");
    assert.equal(calls, 2);
    await assert.rejects(service.run(limitedRun.id, 1), /reconciliation/);
    const interruptedSelection = { ...selected, seed: 1736 }, interruptedPlan = createPlan(config, "live", interruptedSelection);
    let ambiguousCalls = 0;
    const interrupted = createEvaluationService(db, pool, config, { ...adapter, async generate() {
      ambiguousCalls++; throw new ModelFailure("response_unknown", false, true);
    } });
    const interruptedRun = await interrupted.create(interruptedSelection, { ...approval, planHash: interruptedPlan.hash });
    assert.equal((await interrupted.run(interruptedRun.id, 1)).status, "blocked");
    await assert.rejects(interrupted.run(interruptedRun.id, 1), /reconciliation/);
    assert.equal(ambiguousCalls, 1);
    const uncertain = await interrupted.report(interruptedRun.id) as { metrics: ReturnType<typeof summarize> };
    assert.equal(uncertain.metrics.byArm.standard.actualMicroUsd, null);
    assert.ok(uncertain.metrics.byArm.standard.reservedOrActualMicroUsd > 0);
  } finally { await fixture.close(); }
});
