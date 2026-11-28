import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Database } from "../db";
import type { Config } from "../config";
import { cfProblems, problemStatements, analysisJobs, analysisVersions, mathematicalDiscoveries, verificationResults,
  modelUsage, reasoningConcepts, conceptRelationships, problemConcepts, analysisBatches } from "../db/schema";
import { analysisCandidateSchema, critiqueReportSchema, type AnalysisCandidate, type CritiqueReport } from "../../docs/design/reasoning-contracts";
import { buildAnalysisInput, canonicalStatementContent, sha256, statementHash, storedStatementHash, statementRegistrationSchema,
  validateStatement, type StatementRegistration } from "./statement";
import { parseAnalysisOutput, parseCritiqueOutput, type AnalysisRunOutput } from "./structured-output";
import { BLIND_PROMPT, BLIND_VERSION, CRITIQUE_PROMPT, CRITIQUE_VERSION, PRIMARY_PROMPT, PRIMARY_VERSION, promptHash } from "./prompts";
import { ModelFailure, type ModelAdapter, type ModelCall, type ModelRole } from "./model";
import { CLASSIFICATION_PROMPT, CLASSIFICATION_VERSION } from "./prompts";
import { parseMathematics, trainingStageSchema, mathematicsJsonSchema, trainingJsonSchema, unknownTraining } from "./stages";
import { createKnowledgeService } from "./knowledge";
import { STATEMENT_WRITE_LOCK } from "./dataset";

const ANALYSIS_SCHEMA = "analysis-candidate/0.2";
const inputPolicy = "statement-allowlist/0.1";
type Tier = "standard" | "strong";
type Job = typeof analysisJobs.$inferSelect;
function safeCode(error: unknown) { return error instanceof ModelFailure ? error.code : "pipeline_failed"; }
function comparison(a: string, b: string) { return a.trim().split(/\s+/).join(" ") === b.trim().split(/\s+/).join(" "); }

export function createReasoningService(db: Database, pool: Pool, config: Config, model: ModelAdapter) {
  async function registerStatement(raw: unknown) {
    const value = statementRegistrationSchema.parse(raw);
    if (value.sourceKind === "synthetic-fixture" && config.NODE_ENV === "production") throw new Error("Synthetic statements are disabled in production");
    // Dataset statements come only from `npm run dataset:import`, which enforces precedence and revocation.
    if (value.sourceKind === "licensed-dataset") throw new Error("licensed-dataset statements are imported only by npm run dataset:import");
    const [problem] = await db.select().from(cfProblems).where(eq(cfProblems.key, value.problemKey));
    if (!problem || !problem.inProblemset || problem.rating === null || problem.rating < 1200 || problem.rating > 2000) throw new Error("Problem is not eligible");
    const content = canonicalStatementContent(value);
    const contentHash = statementHash(value);
    const tentative = buildAnalysisInput("00000000-0000-4000-8000-000000000000", contentHash, content);
    if (!validateStatement(tentative).usable) throw new Error("Statement is incomplete");
    await db.transaction(async tx => {
      // Same lock as the dataset import, so the two never interleave their created_at order.
      await tx.execute(sql`select pg_advisory_xact_lock(${STATEMENT_WRITE_LOCK})`);
      await tx.insert(problemStatements).values({ problemKey: value.problemKey, ownerId: value.ownerId, scope: value.scope,
        locale: value.locale, sourceKind: value.sourceKind, sourceRef: value.sourceRef, grantRef: value.grantRef,
        attribution: value.attribution, processingAllowed: true, sharingAllowed: value.sharingAllowed,
        contentHash, content, approvedAt: new Date(value.approvedAt) }).onConflictDoNothing();
    });
    const [row] = await db.select().from(problemStatements).where(and(eq(problemStatements.problemKey, value.problemKey),
      eq(problemStatements.contentHash, contentHash), eq(problemStatements.grantRef, value.grantRef)));
    if (!row || row.revokedAt) throw new Error("Statement authorization is revoked");
    return { id: row.id, problemKey: row.problemKey, contentHash: row.contentHash, scope: row.scope, approvedAt: row.approvedAt };
  }

  async function enqueue(problemKey: string, options: { tier?: Tier; mode?: "mock" | "live"; statementId?: string; batchId?: string; revision?: string } = {}) {
    if (options.revision !== undefined && (!options.revision.length || options.revision.length > 80)) throw new Error("Invalid revision");
    const mode = options.mode ?? model.mode;
    if (mode !== model.mode) throw new Error("Adapter mode mismatch");
    if (mode === "live" && (config.AI_ENABLED !== "true" || config.AI_DRY_RUN !== "false")) throw new Error("Live inference disabled");
    if (mode === "live" && !new Set(config.AI_APPROVED_PROBLEM_KEYS?.split(",").map(key => key.trim()) ?? []).has(problemKey)) {
      throw new Error("Problem is outside the approved pilot set");
    }
    const [problem] = await db.select().from(cfProblems).where(eq(cfProblems.key, problemKey));
    if (!problem || !problem.inProblemset || problem.rating === null || problem.rating < 1200 || problem.rating > 2000) return { status: "ineligible" as const };
    const [statement] = await db.select().from(problemStatements).where(and(eq(problemStatements.problemKey, problemKey),
      eq(problemStatements.scope, "shared")))
      .orderBy(sql`${problemStatements.createdAt} desc`, sql`${problemStatements.id} desc`).limit(1);
    if (!statement || statement.revokedAt || !statement.sharingAllowed || !statement.processingAllowed) return { status: "missing_statement" as const };
    if (options.statementId && options.statementId !== statement.id) return { status: "statement_changed" as const };
    if (mode === "live" && statement.sourceKind !== "operator-approved") throw new Error("Live catalog analysis requires an approved real statement");
    const content = statement.content as ReturnType<typeof canonicalStatementContent>;
    const input = buildAnalysisInput(statement.id, statement.contentHash, content);
    const usable = validateStatement(input);
    if (!usable.usable) return { status: usable.reason };
    const tier = options.tier ?? (problem.rating >= 1800 ? "strong" : "standard");
    const modelId = mode === "mock" ? "mock" : (tier === "strong" ? config.OPENAI_STRONG_MODEL : config.OPENAI_STANDARD_MODEL);
    if (!modelId) throw new Error("Configured model ID missing");
    const key = sha256(JSON.stringify([statement.id, statement.contentHash, PRIMARY_VERSION, promptHash("analysis"), ANALYSIS_SCHEMA, inputPolicy, mode, tier, modelId, options.revision ?? "initial"]));
    await db.insert(analysisJobs).values({ statementId: statement.id, batchId: options.batchId ?? null, analysisKey: key, mode, tier, modelId,
      promptVersion: PRIMARY_VERSION, promptHash: promptHash("analysis"), schemaVersion: ANALYSIS_SCHEMA,
      maxAttempts: config.AI_MAX_ATTEMPTS }).onConflictDoNothing();
    const [job] = await db.select().from(analysisJobs).where(eq(analysisJobs.analysisKey, key));
    return { status: job.status, jobId: job.id, cached: job.status === "completed" };
  }

  async function claimOne(jobId?: string): Promise<Job | null> {
    const client = await pool.connect();
    try {
      // A job can make three sequential provider calls, each with a preflight.
      const leaseSeconds = Math.ceil(config.AI_TIMEOUT_MS * 10 / 1000) + 120;
      await client.query(`update analysis_jobs set status=case when mode='live' then 'blocked' else 'failed' end,
        error_code='lease_attempt_limit', lease_until=null, updated_at=now()
        where status='running' and lease_until<now() and attempts>=max_attempts`);
      const result = await client.query<{ id: string }>(`update analysis_jobs set status='running', attempts=attempts+1,
        lease_until=now()+($1::integer * interval '1 second'), updated_at=now()
        where id=(select id from analysis_jobs where ((status='queued' and next_run_at<=now())
          or (status='running' and lease_until<now())) and attempts<max_attempts and mode=$2
          and (($3::uuid is not null and id=$3::uuid) or ($3::uuid is null and batch_id is null))
          order by next_run_at,id for update skip locked limit 1) returning id`, [leaseSeconds, model.mode, jobId ?? null]);
      if (!result.rows[0]) return null;
      const [job] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, result.rows[0].id));
      return job ?? null;
    } finally { client.release(); }
  }

  async function reserve(job: Job, role: ModelRole, call: ModelCall) {
    const provenance = { promptVersion: role === "analysis" ? PRIMARY_VERSION : role === "classification" ? CLASSIFICATION_VERSION : role === "blind" ? BLIND_VERSION : CRITIQUE_VERSION,
      promptHash: promptHash(role), inputHash: sha256(JSON.stringify({ system: call.system, input: call.input })) };
    if (model.mode === "mock") {
      const [row] = await db.insert(modelUsage).values({ jobId: job.id, role, mode: "mock", modelId: call.modelId,
        ...provenance, status: "reserved", reservedMicroUsd: 0 }).returning();
      return row;
    }
    const strong = call.modelId === config.OPENAI_STRONG_MODEL;
    const inputRate = strong ? config.OPENAI_STRONG_INPUT_USD_PER_M : config.OPENAI_STANDARD_INPUT_USD_PER_M;
    const outputRate = strong ? config.OPENAI_STRONG_OUTPUT_USD_PER_M : config.OPENAI_STANDARD_OUTPUT_USD_PER_M;
    // UTF-8 byte count plus envelope overhead is a conservative token ceiling;
    // the provider's max_output_tokens bounds the other side of the reservation.
    const inputBound = Buffer.byteLength(JSON.stringify(call), "utf8") + 2000;
    const worstMicro = Math.ceil(inputBound * inputRate + config.AI_MAX_OUTPUT_TOKENS * outputRate);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(82461009)`);
      const [spent] = await tx.select({ total: sql<number>`coalesce(sum(coalesce(${modelUsage.actualMicroUsd}, ${modelUsage.reservedMicroUsd})),0)::bigint` }).from(modelUsage).where(eq(modelUsage.mode, "live"));
      const evaluationSpent = await tx.execute(sql`select coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0) as total from math_evaluation_calls where mode='live'`);
      if (Number(spent.total) + Number(evaluationSpent.rows[0].total) + worstMicro > Math.floor(config.AI_SPEND_LIMIT_USD * 1_000_000)) throw new ModelFailure("spend_cap", false, false);
      if (job.batchId) {
        const [batch] = await tx.select().from(analysisBatches).where(eq(analysisBatches.id, job.batchId));
        const total = await tx.execute(sql`select coalesce(sum(coalesce(u.actual_micro_usd,u.reserved_micro_usd)),0) as total from reasoning_model_usage u join analysis_jobs j on j.id=u.job_id where j.batch_id=${job.batchId}`);
        const approval = batch?.approval as { expiresAt?: string } | null;
        if (!batch || batch.status !== "running" || !approval?.expiresAt || Date.parse(approval.expiresAt) <= Date.now() || Number(total.rows[0].total) + worstMicro > batch.budgetMicroUsd) throw new ModelFailure("spend_cap", false, false);
      }
      const [row] = await tx.insert(modelUsage).values({ jobId: job.id, role, mode: "live", modelId: call.modelId,
        ...provenance, status: "reserved", reservedMicroUsd: worstMicro }).returning();
      return row;
    });
  }

  async function callModel(job: Job, role: ModelRole, input: string, system: string) {
    const modelId = role === "analysis" || role === "classification" ? job.modelId : (model.mode === "mock" ? "mock" : config.OPENAI_STRONG_MODEL!);
    const call: ModelCall = { role, modelId, input, system, ...(role === "analysis" ? { outputFormat: { name: "independent_mathematics", schema: mathematicsJsonSchema } } : role === "classification" ? { outputFormat: { name: "training_classification", schema: trainingJsonSchema } } : {}) };
    if (model.mode === "live" && !(await model.available?.(modelId))) throw new ModelFailure("model_unavailable", false, false);
    const usage = await reserve(job, role, call);
    let recorded = false;
    try {
      const result = await model.generate(call);
      const strong = modelId === config.OPENAI_STRONG_MODEL;
      const inputRate = strong ? config.OPENAI_STRONG_INPUT_USD_PER_M : config.OPENAI_STANDARD_INPUT_USD_PER_M;
      const outputRate = strong ? config.OPENAI_STRONG_OUTPUT_USD_PER_M : config.OPENAI_STANDARD_OUTPUT_USD_PER_M;
      const known = Number.isSafeInteger(result.inputTokens) && Number.isSafeInteger(result.outputTokens) && result.inputTokens! >= 0 && result.outputTokens! >= 0;
      const actual = model.mode === "mock" ? 0 : known ? Math.ceil(result.inputTokens! * inputRate + result.outputTokens! * outputRate) : null;
      await db.update(modelUsage).set({ status: known ? "completed" : "usage_unknown", responseId: result.responseId,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, actualMicroUsd: actual,
        outputHash: sha256(JSON.stringify(result.value)),
        completedAt: new Date() }).where(eq(modelUsage.id, usage.id));
      recorded = true;
      if (model.mode === "live" && (!known || actual! > usage.reservedMicroUsd)) throw new ModelFailure("usage_reconciliation_required", false, true);
      return result.value;
    } catch (error) {
      if (recorded) throw error;
      const uncertain = model.mode === "live" && (!(error instanceof ModelFailure) || error.mayHaveCharged);
      await db.update(modelUsage).set({ status: uncertain ? "usage_unknown" : "failed", errorCode: safeCode(error),
        actualMicroUsd: uncertain ? null : 0, completedAt: new Date() }).where(eq(modelUsage.id, usage.id));
      throw error;
    }
  }

  async function persistCandidate(job: Job, candidate: AnalysisCandidate, predictions: AnalysisRunOutput["samplePredictions"],
    statement: typeof problemStatements.$inferSelect) {
    const content = statement.content as ReturnType<typeof canonicalStatementContent>;
    const hash = sha256(JSON.stringify(candidate));
    const exact = content.sampleComparison === "exact-tokens";
    const unique = new Set(predictions.map(p => p.sampleIndex));
    const samplePass = exact && predictions.length === content.examples.length && unique.size === predictions.length &&
      predictions.every(p => p.sampleIndex < content.examples.length && comparison(p.output, content.examples[p.sampleIndex].output));
    const outcome = !exact ? "unsupported" : samplePass ? "pass" : "fail";
    const status = outcome === "fail" ? "disputed" : outcome === "pass" ? "tested" : "unreviewed";
    return db.transaction(async tx => {
      const [version] = await tx.insert(analysisVersions).values({ jobId: job.id, statementId: statement.id,
        problemKey: statement.problemKey, candidateHash: hash, candidate, status,
        uncertainty: candidate.uncertainties }).returning();
      const discoveries: (typeof mathematicalDiscoveries.$inferInsert)[] = [];
      if (candidate.coreDiscovery.status === "present") discoveries.push({ analysisId: version.id, localId: "core", kind: "core",
        proposition: candidate.coreDiscovery.content.explanation, details: candidate.coreDiscovery.content });
      if (candidate.observations.status === "present") for (const observation of candidate.observations.content) discoveries.push({ analysisId: version.id,
        localId: observation.id, kind: "observation", proposition: observation.proposition, details: observation });
      if (candidate.discoveryBottlenecks.status === "present") for (const bottleneck of candidate.discoveryBottlenecks.content) discoveries.push({ analysisId: version.id,
        localId: bottleneck.id, kind: "bottleneck", proposition: bottleneck.diagnosticQuestion, details: bottleneck });
      if (discoveries.length) await tx.insert(mathematicalDiscoveries).values(discoveries);
      await tx.insert(verificationResults).values({ analysisId: version.id, method: "sample", outcome,
        scope: exact ? `All ${content.examples.length} authorized sample predictions; exact token comparison only` : "No validated unique-output comparator",
        evidence: { samplePredictions: predictions, expectedHash: sha256(JSON.stringify(content.examples)), comparator: content.sampleComparison },
        actorRef: "deterministic-sample-v1" });
      return version;
    });
  }

  async function processJob(job: Job) {
    const [statement] = await db.select().from(problemStatements).where(eq(problemStatements.id, job.statementId));
    if (job.mode !== model.mode || (job.mode === "live" && (config.AI_ENABLED !== "true" || config.AI_DRY_RUN !== "false" ||
      !new Set(config.AI_APPROVED_PROBLEM_KEYS?.split(",").map(key => key.trim()) ?? []).has(statement?.problemKey ?? "")))) {
      throw new ModelFailure("inference_disabled", false, false);
    }
    if (job.promptVersion !== PRIMARY_VERSION || job.promptHash !== promptHash("analysis") || job.schemaVersion !== ANALYSIS_SCHEMA ||
      job.modelId !== (job.mode === "mock" ? "mock" : job.tier === "strong" ? config.OPENAI_STRONG_MODEL : config.OPENAI_STANDARD_MODEL)) {
      throw new ModelFailure("job_configuration_changed", false, false);
    }
    const [problem] = statement ? await db.select().from(cfProblems).where(eq(cfProblems.key, statement.problemKey)) : [];
    const [latest] = statement ? await db.select({ id: problemStatements.id }).from(problemStatements).where(and(eq(problemStatements.problemKey, statement.problemKey),eq(problemStatements.scope,"shared")))
      .orderBy(sql`${problemStatements.createdAt} desc`,sql`${problemStatements.id} desc`).limit(1) : [];
    if (!statement || statement.revokedAt || !statement.processingAllowed || statement.scope !== "shared" || !statement.sharingAllowed ||
      latest?.id !== statement.id || (job.mode === "live" && statement.sourceKind !== "operator-approved") ||
      !problem || !problem.inProblemset || problem.rating === null || problem.rating < 1200 || problem.rating > 2000) {
      throw new ModelFailure("source_or_eligibility_changed", false, false);
    }
    const content = statement.content as ReturnType<typeof canonicalStatementContent>;
    const input = buildAnalysisInput(statement.id, statement.contentHash, content);
    if (storedStatementHash(content) !== statement.contentHash || !validateStatement(input).usable) throw new ModelFailure("statement_invalid", false, false);
    let [version] = await db.select().from(analysisVersions).where(eq(analysisVersions.jobId, job.id));
    if (!version) {
      const math = parseMathematics(job.derivation ?? await callModel(job, "analysis", JSON.stringify(input), PRIMARY_PROMPT));
      if (!job.derivation) await db.update(analysisJobs).set({ derivation: math }).where(eq(analysisJobs.id, job.id));
      const training = math.mathematics.disposition === "complete" ? trainingStageSchema.parse(await callModel(job, "classification",
        JSON.stringify({ statement: input, frozenMathematics: math.mathematics }), CLASSIFICATION_PROMPT)) : unknownTraining();
      const candidate = analysisCandidateSchema.parse({ ...math.mathematics, ...training });
      version = await persistCandidate(job, candidate, math.samplePredictions, statement);
    }
    const candidate = analysisCandidateSchema.parse(version.candidate);
    if (candidate.disposition !== "complete" || version.status === "disputed") return version;
    let [blind] = await db.select().from(verificationResults).where(and(eq(verificationResults.analysisId, version.id), eq(verificationResults.method, "blind-derivation")));
    if (!blind) {
      const raw = await callModel(job, "blind", JSON.stringify(input), BLIND_PROMPT);
      const parsed = parseAnalysisOutput(raw);
      const [saved] = await db.insert(verificationResults).values({ analysisId: version.id, method: "blind-derivation", outcome: "inconclusive",
        scope: "Fresh context, statement-only derivation; agreement is not proof", evidence: parsed.candidate,
        actorRef: "model-blind-v1" }).returning();
      blind = saved;
    }
    const frozenBlind = analysisCandidateSchema.parse(blind.evidence);
    const rawCritique = await callModel(job, "critique", JSON.stringify({ statement: input,
      primary: { analysisId: `a_${version.id}`, hash: version.candidateHash, candidate },
      blind: { hash: sha256(JSON.stringify(frozenBlind)), candidate: frozenBlind },
      evidence: [{ method: "sample", outcome: version.status === "tested" ? "pass" : "unsupported" }] }), CRITIQUE_PROMPT);
    const critique = parseCritiqueOutput(rawCritique);
    checkCritique(critique, version.id, version.candidateHash, frozenBlind, candidate);
    const contradictory = critique.contradictions.length > 0 || critique.claimReviews.some(review => review.verdict === "contradicted") ||
      critique.bottleneckReviews.some(review => review.verdict === "incorrect");
    await db.transaction(async tx => {
      await tx.insert(verificationResults).values({ analysisId: version.id, method: "independent-critique",
        outcome: contradictory ? "fail" : critique.recommendation === "human-review" ? "inconclusive" : "unsupported",
        scope: "Model critique only; not mathematical verification", evidence: critique, actorRef: "model-critique-v1" });
      if (contradictory) await tx.update(analysisVersions).set({ status: "disputed" }).where(eq(analysisVersions.id, version.id));
    });
    return version;
  }

  async function runOne(jobId?: string) {
    const job = await claimOne(jobId);
    if (!job) return null;
    // A crash after reserving or receiving a paid response leaves an ambiguous
    // boundary. Do not replay it automatically; an operator must reconcile it.
    if (job.mode === "live" && job.attempts > 1) {
      const prior = await db.select({ status: modelUsage.status }).from(modelUsage).where(eq(modelUsage.jobId, job.id));
      if (prior.some(row => row.status !== "failed")) {
        await db.update(analysisJobs).set({ status: "blocked", errorCode: "paid_call_reconciliation_required",
          leaseUntil: null, updatedAt: new Date() }).where(eq(analysisJobs.id, job.id));
        return { jobId: job.id, status: "blocked", errorCode: "paid_call_reconciliation_required" };
      }
    }
    try {
      const version = await processJob(job);
      await db.update(analysisJobs).set({ status: "completed", leaseUntil: null, errorCode: null, updatedAt: new Date() }).where(eq(analysisJobs.id, job.id));
      return { jobId: job.id, status: "completed", analysisId: version.id };
    } catch (error) {
      const code = safeCode(error);
      const retryable = error instanceof ModelFailure ? error.retryable : error instanceof Error && error.name === "ZodError";
      const priorPaid = job.mode === "live" ? await db.select({ status: modelUsage.status }).from(modelUsage).where(eq(modelUsage.jobId, job.id)) : [];
      const needsReconciliation = priorPaid.some(row => row.status !== "failed");
      const status = needsReconciliation || code === "inference_disabled" || code === "job_configuration_changed" || code === "spend_cap" || code === "model_unavailable" || code === "source_or_eligibility_changed" || code === "statement_invalid" ? "blocked"
        : retryable && job.attempts < job.maxAttempts ? "queued" : "failed";
      const delay = Math.min(60, 2 ** Math.max(0, job.attempts - 1));
      await db.update(analysisJobs).set({ status, errorCode: code === "pipeline_failed" && retryable ? "invalid_structured_output" : code,
        leaseUntil: null, nextRunAt: new Date(Date.now() + delay * 1000), updatedAt: new Date() }).where(eq(analysisJobs.id, job.id));
      return { jobId: job.id, status, errorCode: code };
    }
  }

  async function runBatch(limit = config.AI_BATCH_SIZE) {
    if (!Number.isInteger(limit) || limit < 1 || limit > config.AI_BATCH_SIZE) throw new Error("Batch limit exceeds configured bound");
    const results = [];
    for (let i = 0; i < limit; i++) { const result = await runOne(); if (!result) break; results.push(result); }
    return results;
  }

  async function reviewProof(analysisId: string, review: { reviewerRef: string; proofAccepted: boolean; bottlenecksAccepted: boolean; rationale: string }) {
    if (!review.reviewerRef || !review.rationale) throw new Error("Named review and rationale required");
    return db.transaction(async tx => {
      const [version] = await tx.select().from(analysisVersions).where(eq(analysisVersions.id, analysisId)).for("update");
      if (!version || version.status !== "tested" || !review.proofAccepted || !review.bottlenecksAccepted) throw new Error("Proof review cannot promote this analysis");
      const [statement] = await tx.select().from(problemStatements).where(eq(problemStatements.id, version.statementId));
      if (!statement || statement.revokedAt || !statement.processingAllowed || !statement.sharingAllowed || statement.scope !== "shared") throw new Error("No current shared-source permission");
      const [latest] = await tx.select({ id: problemStatements.id }).from(problemStatements).where(and(eq(problemStatements.problemKey,statement.problemKey),eq(problemStatements.scope,"shared")))
        .orderBy(sql`${problemStatements.createdAt} desc`,sql`${problemStatements.id} desc`).limit(1);
      const [problem] = await tx.select().from(cfProblems).where(eq(cfProblems.key,statement.problemKey));
      if (latest.id !== statement.id || !problem.inProblemset || problem.rating === null || problem.rating < 1200 || problem.rating > 2000) throw new Error("Review source or eligibility changed");
      const results = await tx.select().from(verificationResults).where(eq(verificationResults.analysisId, analysisId));
      if (!results.some(r => r.method === "sample" && r.outcome === "pass") || results.some(r => r.outcome === "fail") ||
        !results.some(r => r.method === "independent-critique")) throw new Error("Required verification evidence missing");
      const critiqueRow = results.find(r => r.method === "independent-critique");
      const critique = critiqueReportSchema.safeParse(critiqueRow?.evidence);
      const candidate = analysisCandidateSchema.parse(version.candidate);
      if (candidate.disposition !== "complete" || candidate.uncertainties.length || candidate.claims.some(c => c.gaps.length)) throw new Error("Incomplete mathematics cannot be reviewed as correct");
      if (!critique.success || critique.data.recommendation !== "human-review" || critique.data.unresolvedIssues.length ||
        critique.data.contradictions.length || critique.data.claimReviews.length !== candidate.claims.length ||
        critique.data.claimReviews.some(r => r.verdict !== "supported-by-argument") ||
        critique.data.bottleneckReviews.some(r => r.verdict !== "plausible")) throw new Error("Critique leaves unresolved issues");
      await tx.insert(verificationResults).values({ analysisId, method: "human-proof-review", outcome: "pass", scope: "Operator review of proof and predicted bottlenecks",
        evidence: review, actorRef: review.reviewerRef });
      await tx.update(analysisVersions).set({ status: "proof-reviewed", reviewedAt: new Date() }).where(eq(analysisVersions.id, analysisId));
      return { analysisId, status: "proof-reviewed" };
    });
  }

  async function addConcept(raw: { id: string; facet: string; label: string; definition: string; reviewerRef: string }) {
    if (!raw.id || !raw.facet || !raw.label || !raw.definition || !raw.reviewerRef) throw new Error("Reviewed concept fields required");
    if (!["primary-discovery","secondary-observation","proof-technique","algorithmic-technique","discovery-obstacle","prerequisite","transferable-skill"].includes(raw.facet)) throw new Error("Unknown taxonomy facet");
    if (!/^[a-z][a-z0-9.-]{1,127}$/.test(raw.id)) throw new Error("Stable normalized concept ID required");
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(82461011)`);
      const existing = await tx.select().from(reasoningConcepts).where(sql`${reasoningConcepts.id}=${raw.id} or (${reasoningConcepts.facet}=${raw.facet} and lower(trim(${reasoningConcepts.label}))=lower(trim(${raw.label})))`);
      if (existing.some(c => c.id !== raw.id || c.facet !== raw.facet || c.label !== raw.label || c.definition !== raw.definition)) throw new Error("Normalize the conflicting concept before insertion; IDs are immutable");
      await tx.insert(reasoningConcepts).values({ ...raw, taxonomyVersion: "reasoning-taxonomy/0.2", status: "active" }).onConflictDoNothing();
    });
  }
  async function relateConcepts(fromId: string, toId: string, kind: "broader" | "prerequisite" | "related", reviewerRef: string) {
    if (!reviewerRef || fromId === toId) throw new Error("Reviewed distinct relationship required");
    if (!["broader","prerequisite","related"].includes(kind)) throw new Error("Unknown relationship");
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(82461011)`);
      const [from] = await tx.select().from(reasoningConcepts).where(eq(reasoningConcepts.id,fromId));
      const [to] = await tx.select().from(reasoningConcepts).where(eq(reasoningConcepts.id,toId));
      if (!from || !to || from.status !== "active" || to.status !== "active" || (kind === "broader" && from.facet !== to.facet)) throw new Error("Invalid concept relationship");
      if (kind !== "related") {
        const reachable = await tx.execute(sql`with recursive reachable(id) as (select ${toId}::text union select r.to_id from reasoning_concept_relationships r join reachable n on r.from_id=n.id where r.kind=${kind}) select 1 from reachable where id=${fromId}`);
        if (reachable.rows.length) throw new Error("Concept dependency cycle");
      }
      await tx.insert(conceptRelationships).values({ fromId, toId, kind, reviewerRef }).onConflictDoNothing();
    });
  }
  async function mapProblemConcept(analysisId: string, conceptId: string, evidenceLocalId: string, reviewerRef: string, weight = 100) {
    if (!reviewerRef) throw new Error("Reviewer required");
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) throw new Error("Weight must be an integer from 1 to 100");
    await db.transaction(async tx => {
      const [version] = await tx.select().from(analysisVersions).where(eq(analysisVersions.id, analysisId)).for("update");
      const [concept] = await tx.select().from(reasoningConcepts).where(eq(reasoningConcepts.id, conceptId));
      if (!version || version.status !== "proof-reviewed" || !concept || concept.status !== "active") throw new Error("Accepted analysis and concept required");
      const [evidence] = await tx.select().from(mathematicalDiscoveries).where(and(eq(mathematicalDiscoveries.analysisId, analysisId), eq(mathematicalDiscoveries.localId, evidenceLocalId)));
      if (!evidence) throw new Error("Discovery reference missing");
      if (concept.facet === "discovery-obstacle" && evidence.kind !== "bottleneck" || concept.facet === "primary-discovery" && !["core","observation"].includes(evidence.kind)) throw new Error("Concept must reference the appropriate discovery evidence");
      if (concept.facet === "primary-discovery") {
        const mapped = await tx.select({ id:problemConcepts.conceptId }).from(problemConcepts).innerJoin(reasoningConcepts,eq(reasoningConcepts.id,problemConcepts.conceptId)).where(and(eq(problemConcepts.analysisId,analysisId),eq(reasoningConcepts.facet,"primary-discovery")));
        if (mapped.length >= 2 && !mapped.some(c=>c.id===conceptId)) throw new Error("At most two primary discoveries are permitted");
      }
      await tx.insert(problemConcepts).values({ problemKey: version.problemKey, conceptId, analysisId, evidenceLocalId, reviewerRef, weight }).onConflictDoNothing();
    });
  }

  const knowledge = createKnowledgeService(pool, { fixtureMode: config.NODE_ENV === "test", environment: config.NODE_ENV });
  async function byProblem(problemKey: string) {
    const record = await knowledge.fingerprint(problemKey, "proof-reviewed");
    return record ? { problemKey, analysisId: record.summary.analysisId, status: "proof-reviewed", candidate: record.fingerprint,
      sourceAttribution: record.provenance.attribution, uncertainty: record.ranking.uncertainty } : null;
  }
  async function byConcept(conceptId: string, limit = 50) {
    return (await knowledge.byConcept(conceptId, { trust: "proof-reviewed", limit })).items.map(r => r.summary.key);
  }
  return { registerStatement, enqueue, runOne, runBatch, reviewProof, addConcept, relateConcepts, mapProblemConcept, byProblem, byConcept };
}

function checkCritique(report: CritiqueReport, versionId: string, candidateHash: string, blind: AnalysisCandidate, candidate: AnalysisCandidate) {
  if (report.analysisId !== `a_${versionId}` || report.analysisHash !== candidateHash ||
    report.blindDerivationHash !== sha256(JSON.stringify(blind))) throw new ModelFailure("critique_provenance_mismatch", true, false);
  const claims = candidate.claims.map(c => c.id);
  const bottlenecks = candidate.discoveryBottlenecks.status === "present" ? candidate.discoveryBottlenecks.content.map(b => b.id) : [];
  if (report.claimReviews.length !== claims.length || report.bottleneckReviews.length !== bottlenecks.length ||
    report.claimReviews.some(r => !claims.includes(r.claimId) || r.evidenceIds.length) ||
    report.bottleneckReviews.some(r => !bottlenecks.includes(r.bottleneckId)) ||
    report.contradictions.some(c => c.claimIds.some(id => !claims.includes(id)) || c.evidenceIds.length || c.reproduction === "executed")) {
    throw new ModelFailure("critique_invalid_references", true, false);
  }
}
