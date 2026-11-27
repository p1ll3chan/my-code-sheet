import { z } from "zod";
import type { Pool } from "pg";
import { analysisCandidateSchema } from "../../docs/design/reasoning-contracts";
import { knowledgeCtes } from "./knowledge-sql";

const ids = z.array(z.string().min(1).max(128)).max(200);
export const knowledgeQuerySchema = z.object({ minRating: z.number().int().min(1200).max(2000).default(1200), maxRating: z.number().int().min(1200).max(2000).default(2000),
  concepts: ids.default([]), prerequisites: ids.default([]), exclude: ids.default([]), identities: ids.default([]),
  purpose: z.enum(["discovery", "proof", "transfer", "contrast", "speed", "implementation", "review"]).optional(),
  since: z.string().datetime().optional(), trust: z.enum(["proof-reviewed", "training-ready"]).default("training-ready"),
  after: z.string().max(128).optional(), limit: z.number().int().min(1).max(100).default(30) }).strict().refine(q => q.minRating <= q.maxRating, "Invalid rating interval");
export type KnowledgeQuery = z.input<typeof knowledgeQuerySchema>;
export type SafeProblem = { key: string; name: string; rating: number; contestId: number | null; url: string | null;
  analysisId: string; trust: "training-ready" | "proof-reviewed"; sourceKind: string; analyzedAt: string };

// Server-only: fingerprint/ranking features are spoilers and never part of the
// safe projection. No ModelAdapter or network dependency exists here.
export function createKnowledgeService(pool: Pool, options: { fixtureMode?: boolean; environment?: string } = {}) {
  if (options.fixtureMode && options.environment !== "test") throw new Error("Fixture retrieval is test-only");
  const ctes = knowledgeCtes(options.fixtureMode ?? false);
  async function search(raw: KnowledgeQuery = {}) {
    const q = knowledgeQuerySchema.parse(raw);
    const rows = await pool.query(`with ${ctes}, chosen as (
      select distinct on(v.problem_key) v.* from current_versions v where v.${q.trust === "training-ready" ? "training_ready" : "proof_reviewed"}
      order by v.problem_key,v.created_at desc,v.id desc)
      select p.key,p.name,p.rating,p.contest_id,p.url,v.id as analysis_id,v.source_kind,v.created_at,v.candidate,v.training_ready,v.uncertainty,
        co.start_at as contest_start_at
      from chosen v join cf_problems p on p.key=v.problem_key left join cf_contests co on co.id=p.contest_id
      where p.in_problemset and p.rating between $1 and $2 and not(p.key=any($3::text[]))
        and (cardinality($4::text[])=0 or p.key=any($4::text[])) and ($5::text is null or p.key>$5)
        and ($6::timestamptz is null or co.start_at>=$6)
        and not exists(select 1 from unnest($7::text[]) requested(id) where not exists(select 1 from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=v.id and pc.concept_id=requested.id and rc.status='active'))
        and not exists(select 1 from unnest($8::text[]) requested(id) where not exists(select 1 from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=v.id and pc.concept_id=requested.id and rc.facet='prerequisite' and rc.status='active'))
        and ($9::text is null or exists(select 1 from jsonb_array_elements(case when v.candidate->'trainingPurposes'->>'status'='present' then v.candidate->'trainingPurposes'->'content' else '[]'::jsonb end) t where t->>'purpose'=$9))
      order by p.key limit $10`, [q.minRating, q.maxRating, q.exclude, q.identities, q.after ?? null, q.since ?? null, q.concepts, q.prerequisites, q.purpose ?? null, q.limit + 1]);
    const page = rows.rows.slice(0, q.limit);
    const analysisIds = page.map(r => r.analysis_id);
    const concepts = analysisIds.length ? (await pool.query(`select pc.analysis_id,pc.concept_id,pc.weight,pc.evidence_local_id,rc.facet from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=any($1::uuid[]) and rc.status='active' order by pc.concept_id`, [analysisIds])).rows : [];
    const relations = concepts.length ? (await pool.query(`select from_id,to_id,kind from reasoning_concept_relationships where from_id=any($1::text[]) or to_id=any($1::text[])`, [concepts.map(c => c.concept_id)])).rows : [];
    return { items: page.flatMap(r => { const parsed = analysisCandidateSchema.safeParse(r.candidate); if (!parsed.success) return [];
      const c = parsed.data;
      const safe: SafeProblem = { key: r.key, name: r.name, rating: r.rating, contestId: r.contest_id, url: r.url, analysisId: r.analysis_id,
        trust: r.training_ready ? "training-ready" : "proof-reviewed", sourceKind: r.source_kind, analyzedAt: r.created_at.toISOString() };
      return [{ summary: safe, ranking: { discoveryDifficulty: c.discoveryDifficulty, proofDifficulty: c.proofDifficulty,
        implementationDifficulty: c.implementationDifficulty, concepts: concepts.filter(x => x.analysis_id === r.analysis_id).map(x => ({ id: x.concept_id, facet: x.facet, weight: x.weight / 100, evidenceLocalId: x.evidence_local_id })),
        prerequisiteRelationships: relations.filter(x => x.kind === "prerequisite" && concepts.some(c => c.analysis_id === r.analysis_id && (c.concept_id === x.from_id || c.concept_id === x.to_id))),
        uncertainty: c.uncertainties, trainingPurposes: c.trainingPurposes, contestStartAt: r.contest_start_at?.toISOString() ?? null,
        estimatedTrainingUsefulness: null } }]; }), nextAfter: rows.rows.length > q.limit ? page.at(-1)!.key as string : null };
  }
  async function safeCandidates(query: KnowledgeQuery = {}) { const page = await search(query); return { items: page.items.map(i => i.summary), nextAfter: page.nextAfter }; }
  async function problem(key: string) {
    z.string().min(1).max(128).parse(key);
    const { rows } = await pool.query("select key,name,rating,contest_id as \"contestId\",url,in_problemset as \"inProblemset\" from cf_problems where key=$1", [key]);
    return rows[0] ?? null;
  }
  async function fingerprint(key: string, trust: "proof-reviewed" | "training-ready" = "training-ready") {
    const page = await search({ identities: [key], trust, limit: 1 });
    if (!page.items.length) return null;
    const item = page.items[0];
    const { rows } = await pool.query(`with ${ctes} select id,candidate,candidate_hash,statement_id,content_hash,source_kind,attribution,source_ref,grant_ref,model_id,prompt_version,created_at from current_versions where id=$1 and ${trust === "training-ready" ? "training_ready" : "proof_reviewed"}`, [item.summary.analysisId]);
    if (!rows.length) return null;
    const evidence = await pool.query("select method,outcome,scope,evidence,actor_ref,created_at from reasoning_verification_results where analysis_id=$1 order by created_at,id", [item.summary.analysisId]);
    return { ...item, fingerprint: rows[0].candidate, provenance: { ...rows[0], candidate: undefined }, evidence: evidence.rows };
  }
  async function related(key: string, limit = 20) {
    const origin = await search({ identities: [key], limit: 1 }); if (!origin.items.length) return [];
    const ids = origin.items[0].ranking.concepts.filter(c => ["primary-discovery", "proof-technique"].includes(c.facet)).map(c => c.id);
    if (!ids.length) return [];
    const union = new Map<string, { summary: SafeProblem; sharedConcepts: string[] }>();
    for (const id of ids.slice(0, 20)) for (const row of (await search({ concepts: [id], exclude: [key], limit })).items) {
      const found = union.get(row.summary.key) ?? { summary: row.summary, sharedConcepts: [] }; found.sharedConcepts.push(id); union.set(row.summary.key, found);
    }
    return [...union.values()].sort((a, b) => b.sharedConcepts.length - a.sharedConcepts.length || a.summary.key.localeCompare(b.summary.key)).slice(0, limit);
  }
  return { problem, fingerprint, search, safeCandidates, related,
    byConcept: (concept: string, q: KnowledgeQuery = {}) => search({ ...q, concepts: [concept] }),
    byPrerequisite: (concept: string, q: KnowledgeQuery = {}) => search({ ...q, prerequisites: [concept] }) };
}
