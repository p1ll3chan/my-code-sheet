import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Config } from "../../config";
import type { Database } from "../../db";
import { evaluationRuns, evaluationCases, evaluationCalls, evaluationReviews } from "../../db/schema";
import { ModelFailure, type ModelAdapter, type ModelCall } from "../model";
import { benchmark, manifest, publicStatement, type BenchmarkItem } from "./benchmark";
import { classificationSchema, critiqueSchema, parseClassification, reviewSchema, solutionSchema,
  type Classification, type EvaluationResult, type Solution, type Review } from "./contracts";
import { createPlan, digest, formats, requireLiveApproval, type Approval, type EvaluationPlan } from "./plan";
import { EVALUATION_VERSION, prompts } from "./prompts";
import { verify } from "./verification";
import { summarize, reviewState } from "./metrics";

type Case = typeof evaluationCases.$inferSelect;
const uuid = /^[a-f0-9-]{36}$/i;
const code = (e: unknown) => e instanceof ModelFailure ? e.code : "evaluation_failed";

export function createEvaluationService(db: Database, pool: Pool, config: Config, model: ModelAdapter) {
  async function create(raw: unknown, approvalRaw?: unknown) {
    const plan = createPlan(config, model.mode, raw);
    const approval = model.mode === "live" ? requireLiveApproval(config, plan, approvalRaw) : null;
    const runKey = digest({ plan, approval });
    return db.transaction(async tx => {
      await tx.insert(evaluationRuns).values({ runKey, mode: model.mode, plan: { plan, approval }, manifest: manifest() }).onConflictDoNothing();
      const [run] = await tx.select().from(evaluationRuns).where(eq(evaluationRuns.runKey, runKey));
      await tx.insert(evaluationCases).values(plan.options.fixtureIds.flatMap(fixtureId => plan.options.arms.map(arm => ({ runId: run.id, fixtureId, arm })))).onConflictDoNothing();
      return { id: run.id, status: run.status, planHash: plan.hash };
    });
  }
  async function reserve(item: Case, plan: EvaluationPlan, approval: Approval | null, stage: string, attempt: number, call: ModelCall, promptVersion: string) {
    if (model.mode === "live") requireLiveApproval(config, plan, approval);
    const strong = call.modelId === plan.models.strong;
    const inputRate = strong ? plan.prices.strongInput : plan.prices.standardInput;
    const outputRate = strong ? plan.prices.strongOutput : plan.prices.standardOutput;
    const inputBound = Buffer.byteLength(JSON.stringify(call)) + 2000;
    if (inputBound > plan.estimate.inputBoundPerCall) throw new ModelFailure("input_planning_bound", false, false);
    const reserveMicro = model.mode === "mock" ? 0 : Math.ceil(inputBound * inputRate + plan.maxOutputTokens * outputRate);
    return db.transaction(async tx => {
      // Same lock and combined ledger as the existing analysis worker.
      await tx.execute(sql`select pg_advisory_xact_lock(82461009)`);
      if (model.mode === "live") {
        const total = await tx.execute(sql`select
          (select coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0) from reasoning_model_usage where mode='live') +
          (select coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0) from math_evaluation_calls where mode='live') as total`);
        const runSpent = await tx.execute(sql`select coalesce(sum(coalesce(c.actual_micro_usd,c.reserved_micro_usd)),0) as total
          from math_evaluation_calls c join math_evaluation_cases e on e.id=c.case_id where e.run_id=${item.runId}`);
        if (Number(total.rows[0].total) + reserveMicro > plan.configuredCapMicroUsd || Number(runSpent.rows[0].total) + reserveMicro > approval!.maxSpendMicroUsd) throw new ModelFailure("spend_cap", false, false);
      }
      const [row] = await tx.insert(evaluationCalls).values({ caseId: item.id, stage, attempt, mode: model.mode, modelId: call.modelId,
        promptVersion, promptHash: digest([call.system, call.outputFormat]), inputHash: digest(call.input), status: "reserved", reservedMicroUsd: reserveMicro }).returning();
      return { row, inputRate, outputRate };
    });
  }
  async function call<T>(item: Case, plan: EvaluationPlan, approval: Approval | null, stage: string,
    kind: keyof typeof prompts, tier: "standard" | "strong", input: unknown, parse: (raw: unknown) => T): Promise<T> {
    const prior = await db.select().from(evaluationCalls).where(and(eq(evaluationCalls.caseId, item.id), eq(evaluationCalls.stage, stage))).orderBy(evaluationCalls.attempt);
    const cached = prior.find(p => p.status === "completed");
    if (cached) return parse(cached.output);
    if (model.mode === "live" && prior.length) throw new ModelFailure("manual_reconciliation_required", false, true);
    for (let attempt = prior.length + 1; attempt <= plan.maxAttempts; attempt++) {
      const modelId = plan.models[tier]; if (!modelId) throw new ModelFailure("model_missing", false, false);
      const request: ModelCall = { role: kind === "blind" ? "blind" : kind === "critique" ? "critique" : "analysis", modelId,
        system: prompts[kind], input: JSON.stringify(input), outputFormat: { name: `math_${kind}`, schema: formats[kind] } };
      const { row, inputRate, outputRate } = await reserve(item, plan, approval, stage, attempt, request, `${EVALUATION_VERSION}/${kind}`);
      const started = Date.now();
      let received = false;
      try {
        const answer = await model.generate(request);
        received = true;
        const usageKnown = answer.inputTokens !== null && answer.outputTokens !== null &&
          Number.isSafeInteger(answer.inputTokens) && Number.isSafeInteger(answer.outputTokens) && answer.inputTokens >= 0 && answer.outputTokens >= 0;
        const actual = model.mode === "mock" ? 0 : usageKnown ? Math.ceil(answer.inputTokens! * inputRate + answer.outputTokens! * outputRate) : null;
        const oversized = Buffer.byteLength(JSON.stringify(answer.value)) > plan.maxArtifactBytes;
        await db.update(evaluationCalls).set({ output: oversized ? null : answer.value, outputHash: digest(answer.value), returnedModelId: answer.modelId,
          responseId: answer.responseId, inputTokens: usageKnown ? answer.inputTokens : null, outputTokens: usageKnown ? answer.outputTokens : null,
          actualMicroUsd: actual, latencyMs: Date.now() - started, status: "invalid-output" }).where(eq(evaluationCalls.id, row.id));
        if (actual === null || actual > row.reservedMicroUsd || oversized) throw new ModelFailure(actual === null ? "usage_unknown" : oversized ? "artifact_limit" : "reservation_exceeded", false, actual === null);
        const value = parse(answer.value);
        await db.update(evaluationCalls).set({ status: "completed" }).where(eq(evaluationCalls.id, row.id));
        return value;
      } catch (error) {
        await db.update(evaluationCalls).set({ status: received ? "invalid-output" : model.mode === "live" ? "usage-unknown" : "failed",
          errorCode: code(error), latencyMs: Date.now() - started,
          ...(!received && model.mode === "mock" ? { actualMicroUsd: 0 } : {}) }).where(eq(evaluationCalls.id, row.id));
        if (model.mode === "live" || (error instanceof ModelFailure && !error.retryable) || attempt >= plan.maxAttempts) throw error;
      }
    }
    throw new ModelFailure("attempt_limit", false, false);
  }
  async function evaluate(item: Case, b: BenchmarkItem, plan: EvaluationPlan, approval: Approval | null): Promise<EvaluationResult> {
    const result: EvaluationResult = { solution: null, classification: null, blind: null, critique: null, evidence: [], failures: [],
      escalated: false, baseline: null, schemaValid: false, artifactHash: "", verifiedBeforeReview: false };
    async function solve(tier: "standard" | "strong", prefix: string) {
      result.solution = await call(item, plan, approval, `${prefix}-solve`, "solve", tier, publicStatement(b), x => solutionSchema.parse(x));
      result.evidence = verify(b, result.solution, plan.options.seed);
      const frozen = structuredClone(result.solution);
      try { result.classification = await call(item, plan, approval, `${prefix}-classify`, "classify", tier,
        { statement: publicStatement(b), frozenSolution: frozen }, x => parseClassification(x, frozen)); }
      catch (e) { if (model.mode === "live") throw e; result.classification = null; result.failures.push({ kind: "misleading-classification", detail: "Structured taxonomy mapping invalid; no educational quality inference." }); }
    }
    try {
      await solve(item.arm === "strong" ? "strong" : "standard", "initial");
      if (item.arm === "selective" && (result.solution!.disposition !== "complete" || result.solution!.uncertainty.length ||
        result.evidence.some(e => e.outcome !== "pass") || !result.classification)) {
        result.baseline = structuredClone({ solution: result.solution, classification: result.classification, evidence: result.evidence, failures: result.failures });
        result.escalated = true;
        result.failures = [];
        await solve("strong", "escalated");
      }
      if (item.arm === "standard-critique" || result.escalated) {
        result.blind = await call(item, plan, approval, "blind", "blind", "strong", publicStatement(b), x => solutionSchema.parse(x));
        result.critique = await call(item, plan, approval, "critique", "critique", "strong", { statement: publicStatement(b),
          frozenSolution: result.solution, frozenClassification: result.classification, frozenBlindSolution: result.blind,
          executionEvidence: result.evidence }, x => critiqueSchema.parse(x));
        result.failures.push(...result.critique.issues);
      }
      result.schemaValid = !!result.solution && !!result.classification;
      if (result.evidence.some(e => e.outcome === "fail")) result.failures.push({ kind: "verification-failure", detail: "Bounded execution failed; inspect recorded counterexample or execution limit." });
    } catch (error) {
      result.failures.push({ kind: error instanceof ModelFailure ? "provider-failure" : "invalid-output", detail: code(error) });
      // Preserve partial artifacts and costs. The caller marks the case blocked.
    }
    result.artifactHash = digest({ result: { ...result, artifactHash: null }, fixtureHash: b.hash, planHash: plan.hash });
    return result;
  }
  async function run(runId: string, limit = config.AI_BATCH_SIZE) {
    if (!uuid.test(runId) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid run or batch size");
    const lock = await pool.connect();
    let locked = false;
    try {
      locked = (await lock.query("select pg_try_advisory_lock(hashtextextended($1,9913)) as locked", [runId])).rows[0].locked;
      if (!locked) throw new Error("Evaluation already running");
      const [record] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId));
      if (!record || record.mode !== model.mode) throw new Error("Unknown run or adapter mismatch");
      if (model.mode === "live" && record.status === "blocked") throw new Error("Blocked live run requires operator reconciliation; no automatic continuation");
      const { plan, approval } = record.plan as { plan: EvaluationPlan; approval: Approval | null };
      if (createPlan(config, model.mode, plan.options).hash !== plan.hash) throw new Error("Configuration, fixture or prompt changed; create a new run");
      if (model.mode === "live") {
        requireLiveApproval(config, plan, approval);
        for (const id of new Set(Object.values(plan.models))) if (!id || !model.available || !await model.available(id)) throw new Error("Configured account model unavailable");
      }
      await db.update(evaluationRuns).set({ status: "running" }).where(eq(evaluationRuns.id, runId));
      const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.runId, runId)).orderBy(evaluationCases.fixtureId, evaluationCases.arm);
      let processed = 0;
      for (const item of cases.filter(c => c.status === "queued" || c.status === "running").slice(0, limit)) {
        // On interruption, completed stage calls are reused, ambiguous live calls block.
        await db.update(evaluationCases).set({ status: "running" }).where(eq(evaluationCases.id, item.id));
        const result = await evaluate(item, benchmark.find(b => b.id === item.fixtureId)!, plan, approval);
        const blocked = result.failures.some(f => f.kind === "provider-failure" || f.kind === "invalid-output");
        await db.update(evaluationCases).set({ result, artifactHash: result.artifactHash, status: blocked ? "blocked" : "completed" }).where(eq(evaluationCases.id, item.id));
        processed++;
        if (blocked && model.mode === "live") break;
      }
      const remaining = await db.select().from(evaluationCases).where(eq(evaluationCases.runId, runId));
      const status = remaining.some(c => c.status === "blocked") ? "blocked" : remaining.every(c => c.status === "completed") ? "completed" : "queued";
      await db.update(evaluationRuns).set({ status }).where(eq(evaluationRuns.id, runId));
      return { runId, processed, status };
    } finally {
      if (locked) await lock.query("select pg_advisory_unlock(hashtextextended($1,9913))", [runId]);
      lock.release();
    }
  }
  async function review(caseId: string, raw: unknown) {
    const value = reviewSchema.parse(raw);
    if (!uuid.test(caseId)) throw new Error("Invalid case ID");
    const [item] = await db.select().from(evaluationCases).where(eq(evaluationCases.id, caseId));
    if (!item?.result || item.artifactHash !== value.artifactHash) throw new Error("Review must match the frozen artifact");
    if (value.purpose === "audit") {
      const existing = await db.select().from(evaluationReviews).where(eq(evaluationReviews.caseId, caseId));
      if (!reviewState(item.result as EvaluationResult, existing.map(r => r.review as Review)).assessmentAccepted || existing.some(r => r.reviewer === value.reviewer)) throw new Error("Audit requires prior acceptance and a different reviewer");
    }
    const [saved] = await db.insert(evaluationReviews).values({ caseId, reviewer: value.reviewer, artifactHash: value.artifactHash, review: value }).onConflictDoNothing().returning();
    if (!saved) throw new Error("Reviewer already submitted; immutable review preserved");
    return { id: saved.id };
  }
  async function report(runId: string, blind = false) {
    if (!uuid.test(runId)) throw new Error("Invalid run ID");
    const [record] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId));
    if (!record) throw new Error("Run not found");
    const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.runId, runId)).orderBy(evaluationCases.id);
    const reviews = await db.select().from(evaluationReviews).innerJoin(evaluationCases, eq(evaluationReviews.caseId, evaluationCases.id)).where(eq(evaluationCases.runId, runId));
    const calls = await db.select().from(evaluationCalls).innerJoin(evaluationCases, eq(evaluationCalls.caseId, evaluationCases.id)).where(eq(evaluationCases.runId, runId));
    const entries = cases.map(c => ({ ...c, result: c.result as EvaluationResult | null,
      reviews: reviews.filter(r => r.math_evaluation_reviews.caseId === c.id).map(r => r.math_evaluation_reviews.review as Review),
      calls: calls.filter(r => r.math_evaluation_calls.caseId === c.id).map(r => r.math_evaluation_calls) }));
    if (blind) return { rubricVersion: "math-review/1", mode: record.mode,
      warning: "First-pass packets omit model, arm, automatic score and other reviewers. Text can still reveal identity; note suspected unblinding. Fixture references are provisional, not human gold.",
      packets: entries.filter(e => e.result).map(e => { const b = benchmark.find(b => b.id === e.fixtureId)!;
        return { caseId: e.id, artifactHash: e.artifactHash, statement: publicStatement(b), solution: e.result!.solution,
          classification: e.result!.classification, evidence: e.result!.evidence }; }) };
    return { runId, status: record.status, mode: record.mode, manifest: record.manifest, plan: (record.plan as { plan: EvaluationPlan }).plan,
      metrics: summarize(entries), cases: entries.map(e => ({ ...e, reviewState: e.result ? reviewState(e.result, e.reviews) : null })),
      limitation: "Original fixtures, mock outputs and review records do not establish Codeforces corpus quality. No automatic publication or training access." };
  }
  return { create, run, review, report };
}
