import type { Pool } from "pg";
import { z } from "zod";
import { analysisCandidateSchema } from "../../docs/design/reasoning-contracts";
import { executeProgram, VM_VERSION } from "./evaluation/vm";
import { programSchema, type Program } from "./evaluation/contracts";
import { sha256 } from "./statement";
import { knowledgeCtes } from "./knowledge-sql";

// Trusted server code supplies the oracle/parser. Model data can only execute
// inside the bounded interpreter. Never load a harness from an uploaded module.
export type VerificationHarness = { id: string; version: string; statementHash: string; domain: string;
  parseSample: (input: string) => number[]; parseOutput: (output: string) => number;
  cases: number[][]; oracle: (input: number[]) => number };
export function createVerificationService(pool: Pool) {
  async function execute(analysisId: string, raw: Program, harness: VerificationHarness, reviewerRef: string) {
    const program = programSchema.parse(raw);
    if (!reviewerRef || !harness.id || !harness.version || !harness.domain || !harness.cases.length || harness.cases.length > 1000) throw new Error("Bounded reviewed harness required");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows: [v] } = await client.query(`select v.*,s.content_hash,s.content,s.revoked_at from reasoning_analysis_versions v join problem_statements s on s.id=v.statement_id where v.id=$1 for update of v`, [analysisId]);
      if (!v || v.revoked_at || v.content_hash !== harness.statementHash) throw new Error("Harness source mismatch");
      const common = { analysisHash: v.candidate_hash, statementHash: v.content_hash, programHash: sha256(JSON.stringify(program)), program, vmVersion: VM_VERSION,
        harnessId: harness.id, harnessVersion: harness.version, domain: harness.domain, reviewedBy: reviewerRef };
      const results = [];
      for (const method of ["sample-execution", "differential-execution"] as const) {
        const cases = method === "sample-execution" ? v.content.examples.map((e: { input: string; output: string }) => ({ input: harness.parseSample(e.input), expected: harness.parseOutput(e.output) }))
          : harness.cases.map(input => ({ input, expected: harness.oracle([...input]) }));
        let counterexample: unknown = null, executed = 0;
        if (!cases.length) throw new Error("Empty verification suite");
        for (const c of cases) {
          if (!Number.isSafeInteger(c.expected)) throw new Error("Invalid oracle result");
          executed++;
          try { const actual = executeProgram(program, c.input); if (actual !== c.expected) { counterexample = { ...c, actual }; break; } }
          catch { counterexample = { ...c, error: "bounded_execution_failed" }; break; }
        }
        const outcome = counterexample ? "fail" : "pass";
        await client.query(`insert into reasoning_verification_results(analysis_id,method,outcome,scope,evidence,actor_ref) values($1,$2,$3,$4,$5,$6)`,
          [analysisId, method, outcome, `Executed bounded checks over ${harness.domain}; not a universal proof`, { ...common, executed, planned: cases.length, casesHash: sha256(JSON.stringify(cases)), counterexample }, reviewerRef]);
        results.push({ method, outcome, executed });
      }
      if (results.some(r => r.outcome === "fail")) await client.query("update reasoning_analysis_versions set status='disputed' where id=$1", [analysisId]);
      await client.query("commit"); return results;
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  async function reviewTraining(analysisId: string, raw: unknown) {
    const review = z.object({ reviewerRef: z.string().min(1).max(200), rationale: z.string().min(20).max(10000),
      programMatchesProof: z.literal(true), conceptsAccepted: z.literal(true), trainingAccepted: z.literal(true) }).strict().parse(raw);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from reasoning_analysis_versions where id=$1 for update", [analysisId]);
      const { rows: [v] } = await client.query(`with ${knowledgeCtes(true)} select * from current_versions where id=$1 and proof_reviewed`, [analysisId]);
      if (!v) throw new Error("Current proof-reviewed analysis required");
      const candidate = analysisCandidateSchema.parse(v.candidate);
      if ([candidate.discoveryDifficulty, candidate.proofDifficulty, candidate.implementationDifficulty, candidate.trainingPurposes].some(x => x.status !== "present") || candidate.uncertainties.length) throw new Error("Training classification incomplete");
      const { rows: evidence } = await client.query("select * from reasoning_verification_results where analysis_id=$1", [analysisId]);
      if (evidence.some(e => e.outcome === "fail" || (e.method === "human-proof-review" && e.actor_ref === review.reviewerRef))) throw new Error("Independent review without contradictory evidence required");
      const samples = evidence.filter(e => e.method === "sample-execution" && e.outcome === "pass" && e.evidence.analysisHash === v.candidate_hash);
      if (!samples.some(s => evidence.some(e => e.method === "differential-execution" && e.outcome === "pass" && e.evidence.analysisHash === v.candidate_hash && e.evidence.programHash === s.evidence.programHash))) throw new Error("Matching executed sample and differential evidence required");
      const { rows: concepts } = await client.query(`select pc.concept_id,pc.weight,rc.facet,rc.status from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=$1 order by pc.concept_id`, [analysisId]);
      if (!concepts.some(c => c.facet === "primary-discovery") || concepts.some(c => c.status !== "active")) throw new Error("Reviewed active primary discovery required");
      await client.query(`insert into reasoning_verification_results(analysis_id,method,outcome,scope,evidence,actor_ref) values($1,'human-training-review','pass',$2,$3,$4)`,
        [analysisId, "Independent educational and implementation/proof correspondence review", { ...review, analysisHash: v.candidate_hash, concepts }, review.reviewerRef]);
      await client.query("commit"); return { analysisId, status: "training-ready" };
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  return { execute, reviewTraining };
}
