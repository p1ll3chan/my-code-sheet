import type { Pool } from "pg";
import { knowledgeCtes } from "./knowledge-sql";
export type CoverageStage = "awaitingStatement" | "ready" | "queued" | "analyzing" | "needsReview" | "verified" | "failed" | "blocked";
export type CoverageProblem = { key: string; rating: number; stage: CoverageStage; hasCompleteAnalysis: boolean; trainingReady: boolean };
type Counts = { eligible: number; authorizedStatements: number; completedAnalysis: number; documentedVerification: number; trainingReady: number;
  generatedAnalyses: number; rejectedProblems: number; failedJobs: number; historicalVersions: number; stages: Record<CoverageStage, number> };
export type CoverageSnapshot = Counts & { cataloged: number; unrated: number; lastCatalogSync: string | null; catalogError: string | null;
  byRating: Array<Counts & { rating: number }>; otherRatedEligible: number; snapshotAt: string };
const empty = (): Counts => ({ eligible: 0, authorizedStatements: 0, completedAnalysis: 0, documentedVerification: 0, trainingReady: 0,
  generatedAnalyses: 0, rejectedProblems: 0, failedJobs: 0, historicalVersions: 0,
  stages: { awaitingStatement: 0, ready: 0, queued: 0, analyzing: 0, needsReview: 0, verified: 0, failed: 0, blocked: 0 } });
export function createCoverageService(pool: Pool) {
  async function snapshot(): Promise<{ summary: CoverageSnapshot; problems: CoverageProblem[] }> {
    const client = await pool.connect();
    try {
      await client.query("begin transaction isolation level repeatable read read only");
      const catalog = await client.query(`select count(*) filter(where in_problemset)::int as cataloged,
        count(*) filter(where in_problemset and rating is null)::int as unrated,
        (select refreshed_at from cf_catalog_state where id=1) as last_sync,(select last_error from cf_catalog_state where id=1) as last_error from cf_problems`);
      const result = await client.query(`with ${knowledgeCtes()}, findings as (
        select problem_key,bool_or(proof_reviewed) as verified,bool_or(training_ready) as training_ready,
        bool_or(candidate->>'disposition'='complete') as completed_analysis,
        bool_or(status in ('tested','unreviewed') and candidate->>'disposition'='complete') as needs_review,
        bool_or(status in ('disputed','rejected')) as rejected,count(*)::int as generated from current_versions group by problem_key)
        select p.key,p.rating,s.id as statement_id,j.status as job_status,
          coalesce(f.verified,false) as verified,coalesce(f.training_ready,false) as training_ready,
          coalesce(f.completed_analysis,false) as completed_analysis,coalesce(f.needs_review,false) as needs_review,
          coalesce(f.rejected,false) as rejected,coalesce(f.generated,0)::int as generated,
          (select count(*)::int from analysis_jobs aj where aj.statement_id=s.id and aj.status='failed' and aj.mode='live') as failed_jobs,
          (select count(*)::int from reasoning_analysis_versions av join analysis_jobs aj on aj.id=av.job_id join problem_statements ps on ps.id=av.statement_id
             where av.problem_key=p.key and aj.mode='live' and ps.source_kind='operator-approved' and ps.scope='shared') as historical_versions
        from cf_problems p left join permitted s on s.problem_key=p.key left join findings f on f.problem_key=p.key
        left join lateral(select status from analysis_jobs where statement_id=s.id order by created_at desc,id desc limit 1) j on true
        where p.in_problemset and p.rating between 1200 and 2000 order by p.key`);
      await client.query("commit");
      const counts = empty(), byRating = Array.from({ length: 9 }, (_, i) => ({ rating: 1200 + i * 100, ...empty() }));
      let otherRatedEligible = 0;
      const problems: CoverageProblem[] = [];
      for (const r of result.rows) {
        const stage: CoverageStage = !r.statement_id ? "awaitingStatement" : r.verified ? "verified" : r.job_status === "running" ? "analyzing"
          : r.job_status === "queued" ? "queued" : r.job_status === "failed" || r.rejected ? "failed" : r.job_status === "blocked" ? "blocked"
          : r.needs_review ? "needsReview" : r.job_status === "completed" ? "failed" : "ready";
        problems.push({ key: r.key, rating: r.rating, stage, hasCompleteAnalysis: r.completed_analysis, trainingReady: r.training_ready });
        const band = byRating.find(b => b.rating === r.rating); if (!band) otherRatedEligible++;
        for (const c of [counts, ...(band ? [band] : [])]) {
          c.eligible++; c.stages[stage]++; c.authorizedStatements += Number(!!r.statement_id); c.completedAnalysis += Number(r.completed_analysis);
          c.documentedVerification += Number(r.verified); c.trainingReady += Number(r.training_ready); c.generatedAnalyses += Number(r.generated > 0);
          c.rejectedProblems += Number(r.rejected); c.failedJobs += r.failed_jobs; c.historicalVersions += r.historical_versions;
        }
      }
      const state = catalog.rows[0];
      return { summary: { ...counts, cataloged: state.cataloged, unrated: state.unrated, lastCatalogSync: state.last_sync?.toISOString() ?? null,
        catalogError: state.last_error, byRating, otherRatedEligible, snapshotAt: new Date().toISOString() }, problems };
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
  }
  async function summary() { return (await snapshot()).summary; }
  async function plan(limit = 50, after?: string) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (after !== undefined && (!after.length || after.length > 128))) throw new Error("Invalid dry-run page");
    const { summary: coverage, problems } = await snapshot();
    const candidates = problems.filter(p => p.stage === "ready"), remaining = after ? candidates.filter(p => p.key > after) : candidates;
    const page = remaining.slice(0, limit).map(({ key, rating }) => ({ key, rating }));
    return { mode: "dry-run" as const, coverage, candidateJobs: candidates.length, alreadyVerified: coverage.stages.verified,
      awaitingStatement: coverage.stages.awaitingStatement, order: "stable problem key ascending", page,
      nextAfter: remaining.length > limit ? page.at(-1)!.key : null, snapshotAt: coverage.snapshotAt };
  }
  return { snapshot, summary, plan };
}
