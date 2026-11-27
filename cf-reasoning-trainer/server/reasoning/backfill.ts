import { z } from "zod";
import type { Pool } from "pg";
import type { Config } from "../config";
import type { createReasoningService } from "./service";
import { knowledgeCtes } from "./knowledge-sql";
import { sha256 } from "./statement";
import { PRIMARY_VERSION, promptHash } from "./prompts";

const selectionSchema = z.object({ after: z.string().max(128).optional(), limit: z.number().int().min(1).max(500).default(50),
  identities: z.array(z.string().min(1).max(128)).max(500).default([]), revision: z.string().min(1).max(80).default("initial"),
  reason: z.string().min(10).max(1000).optional(), tier: z.enum(["standard", "strong"]).optional() }).strict();
export type Selection = z.input<typeof selectionSchema>;
const approvalSchema = z.object({ planHash: z.string().length(64), approvalId: z.string().min(1), pilotApprovalRef: z.string().min(1),
  expiresAt: z.string().datetime(), maxSpendUsd: z.number().positive().max(1000), pricingCheckedAt: z.string().datetime(),
  pricingSource: z.string().url(), modelCompatibilityConfirmed: z.literal(true), statementRightsReviewed: z.literal(true) }).strict();
function canonical(value: unknown): string { return JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v); }
function configHash(c: Config) { return sha256(canonical({ standard: c.OPENAI_STANDARD_MODEL ?? null, strong: c.OPENAI_STRONG_MODEL ?? null,
  prices: [c.OPENAI_STANDARD_INPUT_USD_PER_M, c.OPENAI_STANDARD_OUTPUT_USD_PER_M, c.OPENAI_STRONG_INPUT_USD_PER_M, c.OPENAI_STRONG_OUTPUT_USD_PER_M],
  maxAttempts: c.AI_MAX_ATTEMPTS, maxOutput: c.AI_MAX_OUTPUT_TOKENS, timeout: c.AI_TIMEOUT_MS, prompt: PRIMARY_VERSION, promptHash: promptHash("analysis") })); }
export type PlannedItem = { key: string; rating: number; statementId: string; contentHash: string; tier: "standard" | "strong" };
export type BackfillPlan = { version: "backfill-plan/1"; mode: "mock" | "live"; configHash: string; selection: z.output<typeof selectionSchema>;
  items: PlannedItem[]; nextAfter: string | null; awaitingStatements: number; alreadyVerified: number; requiresReviewOrExplicitRevision: number;
  estimatedCalls: number; outputTokenCeiling: number; estimatedInputTokens: number; estimatedCostUsd: number | null; estimateAssumption: string; concurrency: 1 };

// An asynchronous provider can implement submit/poll with a durable ticket.
// Only the inline backend below is implemented; this is not OpenAI Batch support.
export interface AnalysisExecutionBackend {
  kind: "inline" | "asynchronous";
  submit(jobId: string): Promise<{ ticket: string }>;
  poll(ticket: string): Promise<{ status: string }>;
}
export function inlineExecutionBackend(worker: ReturnType<typeof createReasoningService>): AnalysisExecutionBackend {
  return { kind: "inline", submit: async jobId => { await worker.runOne(jobId); return { ticket: jobId }; }, poll: async () => ({ status: "inspect-persisted-job" }) };
}
export function createBackfillService(pool: Pool, config: Config, worker: ReturnType<typeof createReasoningService>) {
  async function plan(mode: "mock" | "live" = "mock", raw: Selection = {}) {
    const selection = selectionSchema.parse(raw);
    if (selection.revision !== "initial" && (!selection.reason || !selection.identities.length)) throw new Error("Selective reanalysis needs identities and a reason");
    const { rows } = await pool.query(`with ${knowledgeCtes(mode === "mock")}
      select p.key,p.rating,s.id as statement_id,s.content_hash,octet_length(s.content::text) as statement_bytes,
        exists(select 1 from current_versions v where v.problem_key=p.key and v.proof_reviewed) as trusted,
        exists(select 1 from analysis_jobs j where j.statement_id=s.id and j.mode=$1) as existing
      from cf_problems p left join permitted s on s.problem_key=p.key
      where p.in_problemset and p.rating between 1200 and 2000 order by p.key`, [mode]);
    const candidates = rows.filter(r => r.statement_id && !r.trusted && (!r.existing || selection.revision !== "initial") &&
      (!selection.identities.length || selection.identities.includes(r.key)) && (!selection.after || r.key > selection.after));
    const items: PlannedItem[] = candidates.slice(0, selection.limit).map(r => ({ key: r.key, rating: r.rating, statementId: r.statement_id, contentHash: r.content_hash,
      tier: selection.tier ?? (r.rating >= 1800 ? "strong" : "standard") }));
    // Scenario estimate only. Runtime reservations use the actual serialized
    // request byte length and a separate global/batch spending lock.
    const inputEstimate = (item: PlannedItem) => Math.ceil(Number(rows.find(r => r.key === item.key)!.statement_bytes) / 4) + 6000;
    const estimatedInputTokens = items.reduce((n,i) => n + 4 * inputEstimate(i) + 3 * config.AI_MAX_OUTPUT_TOKENS, 0);
    const ratesKnown = [config.OPENAI_STANDARD_INPUT_USD_PER_M, config.OPENAI_STANDARD_OUTPUT_USD_PER_M,config.OPENAI_STRONG_INPUT_USD_PER_M,config.OPENAI_STRONG_OUTPUT_USD_PER_M].every(r=>r>0);
    const estimatedCostUsd = mode === "mock" ? 0 : !ratesKnown ? null : items.reduce((n,i) => {
      const inputRate = i.tier === "strong" ? config.OPENAI_STRONG_INPUT_USD_PER_M : config.OPENAI_STANDARD_INPUT_USD_PER_M;
      const outputRate = i.tier === "strong" ? config.OPENAI_STRONG_OUTPUT_USD_PER_M : config.OPENAI_STANDARD_OUTPUT_USD_PER_M;
      return n + ((2*inputEstimate(i)+config.AI_MAX_OUTPUT_TOKENS)*inputRate + (2*inputEstimate(i)+2*config.AI_MAX_OUTPUT_TOKENS)*config.OPENAI_STRONG_INPUT_USD_PER_M +
        2*config.AI_MAX_OUTPUT_TOKENS*(outputRate+config.OPENAI_STRONG_OUTPUT_USD_PER_M))/1e6;
    },0);
    const body: BackfillPlan = { version: "backfill-plan/1", mode, configHash: configHash(config), selection, items,
      nextAfter: candidates.length > selection.limit ? items.at(-1)!.key : null,
      awaitingStatements: rows.filter(r => !r.statement_id).length, alreadyVerified: rows.filter(r => r.trusted).length,
      requiresReviewOrExplicitRevision: rows.filter(r => r.existing && !r.trusted).length,
      estimatedCalls: items.length * 4, outputTokenCeiling: items.length * 4 * config.AI_MAX_OUTPUT_TOKENS * config.AI_MAX_ATTEMPTS,
      estimatedInputTokens, estimatedCostUsd, estimateAssumption: "Four calls per complete problem, statement bytes/4 plus 6000 schema/prompt tokens per call, maximum output and three carried outputs. Excludes retries; pricing is configured, not independently confirmed by this plan. No batch discount.", concurrency: 1 };
    return { ...body, planHash: sha256(canonical(body)), dryRun: true as const };
  }
  function validateApproval(plan: BackfillPlan, hash: string, raw: unknown) {
    const a = approvalSchema.parse(raw);
    if (config.AI_BACKFILL_ENABLED !== "true" || config.AI_ENABLED !== "true" || config.AI_DRY_RUN !== "false" || config.AI_PROVIDER !== "openai" ||
      a.planHash !== hash || a.approvalId !== config.AI_PAID_APPROVAL_ID || !a.pilotApprovalRef.trim() ||
      Date.parse(a.expiresAt) <= Date.now() || Date.parse(a.pricingCheckedAt) > Date.now() || Date.now() - Date.parse(a.pricingCheckedAt) > 7 * 86400000 ||
      a.maxSpendUsd > config.AI_SPEND_LIMIT_USD || !config.OPENAI_STANDARD_MODEL || !config.OPENAI_STRONG_MODEL ||
      [config.OPENAI_STANDARD_INPUT_USD_PER_M, config.OPENAI_STANDARD_OUTPUT_USD_PER_M, config.OPENAI_STRONG_INPUT_USD_PER_M, config.OPENAI_STRONG_OUTPUT_USD_PER_M].some(v => v <= 0) ||
      plan.items.some(i => !new Set(config.AI_APPROVED_PROBLEM_KEYS?.split(",").map(k => k.trim())).has(i.key))) throw new Error("Paid backfill approval/configuration mismatch");
    return a;
  }
  async function create(mode: "mock" | "live", selection: Selection = {}, approval?: unknown) {
    const proposed = await plan(mode, selection);
    const { planHash, dryRun: _, ...body } = proposed;
    if (!body.items.length) throw new Error("No authorized eligible jobs in plan");
    const accepted = mode === "live" ? validateApproval(body, planHash, approval) : null;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`insert into analysis_batches(plan_hash,mode,plan,approval,budget_micro_usd) values($1,$2,$3,$4,$5) on conflict(plan_hash) do nothing`,
        [planHash, mode, body, accepted, accepted ? Math.floor(accepted.maxSpendUsd * 1e6) : 0]);
      const { rows: [batch] } = await client.query("select id from analysis_batches where plan_hash=$1", [planHash]);
      for (const item of body.items) await client.query(`insert into analysis_batch_items(batch_id,problem_key,statement_id) values($1,$2,$3) on conflict do nothing`, [batch.id, item.key, item.statementId]);
      await client.query("commit"); return { batchId: batch.id as string, planHash, jobs: body.items.length };
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  async function status(id: string) {
    z.string().uuid().parse(id);
    const { rows: [batch] } = await pool.query("select id,mode,status,plan_hash,budget_micro_usd,elapsed_ms,created_at,updated_at from analysis_batches where id=$1", [id]);
    if (!batch) return null;
    const { rows: counts } = await pool.query(`select status,count(*)::int as count from analysis_batch_items where batch_id=$1 group by status`, [id]);
    const { rows: [usage] } = await pool.query(`select count(*)::int as calls,coalesce(sum(coalesce(u.actual_micro_usd,u.reserved_micro_usd)),0)::bigint as reserved_or_actual_micro_usd,
      count(*) filter(where u.actual_micro_usd is null)::int as unresolved_calls from reasoning_model_usage u join analysis_jobs j on j.id=u.job_id where j.batch_id=$1`, [id]);
    const completed = counts.find(c => c.status === "completed")?.count ?? 0;
    return { ...batch, counts, usage, completedPerMinute: Number(batch.elapsed_ms) > 0 ? completed * 60000 / Number(batch.elapsed_ms) : null };
  }
  async function run(id: string, limit = config.AI_BATCH_SIZE) {
    z.string().uuid().parse(id);
    if (!Number.isInteger(limit) || limit < 1 || limit > config.AI_BATCH_SIZE) throw new Error("Batch execution limit exceeded");
    const client = await pool.connect(); let locked = false; const started = Date.now();
    try {
      locked = (await client.query("select pg_try_advisory_lock(82461010) as locked")).rows[0].locked;
      if (!locked) throw new Error("Another backfill runner is active; concurrency limit is one");
      const { rows: [batch] } = await client.query("select * from analysis_batches where id=$1", [id]);
      if (!batch) throw new Error("Unknown batch");
      const body = batch.plan as BackfillPlan;
      if (sha256(canonical(body)) !== batch.plan_hash || body.configHash !== configHash(config)) throw new Error("Frozen plan/configuration changed; create a reviewed replacement plan");
      if (body.mode === "live") validateApproval(body, batch.plan_hash, batch.approval);
      await client.query("update analysis_batches set status='running',updated_at=now() where id=$1", [id]);
      const { rows: items } = await client.query("select * from analysis_batch_items where batch_id=$1 and status in ('pending','queued','running') order by problem_key limit $2", [id, limit]);
      for (const item of items) {
        const frozen = body.items.find(i => i.key === item.problem_key)!;
        const { rows: [source] } = await client.query(`with ${knowledgeCtes(body.mode === "mock")} select s.id,s.content_hash,
          exists(select 1 from current_versions v where v.statement_id=s.id and v.proof_reviewed) as trusted from permitted s where s.problem_key=$1`, [item.problem_key]);
        let jobId = item.job_id as string | null;
        if (!source || source.id !== frozen.statementId || source.content_hash !== frozen.contentHash || source.trusted) {
          await client.query("update analysis_batch_items set status='skipped',error_code='source_changed_or_trusted' where batch_id=$1 and problem_key=$2", [id, item.problem_key]); continue;
        }
        if (!jobId) {
          const queued = await worker.enqueue(item.problem_key, { statementId: frozen.statementId, batchId: id, mode: body.mode, tier: frozen.tier, revision: body.selection.revision });
          jobId = queued.jobId ?? null;
          if (!jobId) { await client.query("update analysis_batch_items set status='skipped',error_code='eligibility_changed' where batch_id=$1 and problem_key=$2", [id, item.problem_key]); continue; }
          await client.query("update analysis_batch_items set job_id=$3 where batch_id=$1 and problem_key=$2", [id, item.problem_key, jobId]);
        }
        const { rows: [job] } = await client.query("select batch_id,status from analysis_jobs where id=$1", [jobId]);
        if (job.batch_id !== id) { await client.query("update analysis_batch_items set status='skipped',error_code='job_owned_elsewhere' where batch_id=$1 and problem_key=$2", [id, item.problem_key]); continue; }
        await inlineExecutionBackend(worker).submit(jobId);
        await client.query(`update analysis_batch_items i set status=j.status,error_code=j.error_code from analysis_jobs j where i.batch_id=$1 and i.job_id=j.id and j.id=$2`, [id, jobId]);
        const { rows: [finished] } = await client.query("select status from analysis_jobs where id=$1", [jobId]);
        if (finished.status === "blocked") break;
      }
      await client.query(`update analysis_batches set status=case when exists(select 1 from analysis_batch_items where batch_id=$1 and status='blocked') then 'blocked'
        when exists(select 1 from analysis_batch_items where batch_id=$1 and status in ('pending','queued','running')) then 'paused' else 'completed' end,
        elapsed_ms=elapsed_ms+$2,updated_at=now() where id=$1`, [id, Date.now() - started]);
      return await status(id);
    } catch (error) { if (locked) await client.query("update analysis_batches set status='blocked',updated_at=now() where id=$1 and status='running'", [id]); throw error; }
    finally { if (locked) await client.query("select pg_advisory_unlock(82461010)"); client.release(); }
  }
  return { plan, create, run, status };
}
