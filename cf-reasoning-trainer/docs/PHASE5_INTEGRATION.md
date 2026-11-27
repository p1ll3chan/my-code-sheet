# Phase 5 knowledge interface

Implemented contract, 2026-10-16. Phase 5 development may use the tested synthetic fixtures. The real catalog currently contains no training-ready analysis. No Phase 5 recommendation algorithm is implemented here.

## Entry point and boundaries

Import `createKnowledgeService` and `KnowledgeQuery` from `server/reasoning/knowledge.ts` in server code. Supply the application's existing PostgreSQL pool. The service reads persisted data; it has no model adapter, network dependency or analysis side effect.

```ts
const knowledge = createKnowledgeService(database.pool);
const metadata = await knowledge.problem("c:1234:A");
const fingerprint = await knowledge.fingerprint("c:1234:A");
const candidates = await knowledge.search({
  minRating: 1300, maxRating: 1600,
  concepts: ["discovery.invariant"],
  prerequisites: ["prerequisite.parity"],
  purpose: "discovery", trust: "training-ready",
  exclude: alreadyAcceptedProblemKeys,
  since: "2025-01-01T00:00:00Z", limit: 30,
});
const studentCards = await knowledge.safeCandidates({
  identities: candidates.items.map(item => item.summary.key),
});
```

The concept IDs above are illustrative search terms, not seeded or populated records. An unknown concept returns an empty result. Missing knowledge must remain an explicit empty/setup state; it must never become a fabricated mathematical classification.

## Methods

| Method | Result and behavior |
|---|---|
| `problem(key)` | Catalog metadata or `null`. Returns `key`, `name`, nullable `rating`, nullable `contestId`, nullable `url`, `inProblemset`. May return an unrated or ineligible problem; this is not a training eligibility decision. |
| `fingerprint(key, trust = "training-ready")` | Current accepted record or `null`: `summary`, `ranking`, full `fingerprint`, `provenance`, chronological `evidence`. Full output contains spoilers. |
| `search(query = {})` | `{ items: [{ summary, ranking }], nextAfter }`; stable key order, not personalized ranking. |
| `safeCandidates(query = {})` | `{ items: SafeProblem[], nextAfter }`; explicit allowlist suitable for pre-attempt cards. |
| `byConcept(id, query = {})` | Search requiring that active concept. |
| `byPrerequisite(id, query = {})` | Search requiring that active concept in the `prerequisite` facet. |
| `related(key, limit = 20)` | Training-ready problems sharing reviewed primary discoveries or proof techniques; `{ summary, sharedConcepts }[]`. Shared concepts are spoilers. Similarity is a shared-taxonomy relation, not a proof of equivalent problems. |

`knowledgeQuerySchema` is a strict Zod runtime contract. It accepts:

- `minRating`/`maxRating`: integers within 1200–2000, inclusive; defaults 1200 and 2000; minimum cannot exceed maximum.
- `concepts`, `prerequisites`, `exclude`, `identities`: at most 200 IDs/keys per array, maximum 128 characters each. All requested concepts/prerequisites must match. Empty identity list means unrestricted.
- `purpose`: `discovery`, `proof`, `transfer`, `contrast`, `speed`, `implementation`, or `review`.
- `trust`: `training-ready` (default) or `proof-reviewed`.
- `since`: ISO datetime filtering the official contest start; unknown contest dates do not satisfy this filter.
- `after`: exclusive stable-key cursor; `limit`: 1–100, default 30.

`SafeProblem` contains exactly `key`, `name`, `rating`, `contestId`, `url`, `analysisId`, `trust`, `sourceKind`, `analyzedAt`. It excludes observations, concept IDs, difficulties, hints, proofs, source grants and model outputs. Official problem titles remain visible. Neither `ranking` nor `related().sharedConcepts` is a student-safe DTO. Explicitly select the safe projection before returning pre-attempt data to the client.

## Ranking metadata and provenance

The internal `ranking` object provides three separate structured difficulty sections (`discoveryDifficulty`, `proofDifficulty`, `implementationDifficulty`), reviewed concept IDs/facets/weights/evidence references, prerequisite relationships, uncertainty, training purposes and contest start time. `estimatedTrainingUsefulness` is **null**: personalized suitability is not measured or invented in Phase 4.

Concept weights are operator-reviewed relevance integers 1–100 in storage, exposed as 0.01–1. They are not probabilities, ability estimates, importance learned from student performance or additive scores. Phase 5 must decide how to use them and calibrate any inferred readiness separately from the actual Codeforces rating. Prerequisite edges point from the prerequisite toward the dependent concept. Do not infer independent solving, thinking time or lack of assistance from accepted submissions.

The full fingerprint is validated against `analysisCandidateSchema` (`analysis-candidate/0.2`). Optional categories use `present`, `unknown` or `not-applicable` with reasons. The fingerprint includes concrete predicted sticking points: tempting move, failure witness, diagnostic question and the resolving observations. These are hypotheses about a learner, not evidence that this particular player has that misconception.

Fingerprint provenance includes immutable analysis/statement IDs and hashes, source kind/attribution/source and grant references, configured model and prompt version and timestamp. The model usage ledger separately stores role-specific prompt/input/output hashes, response IDs and usage. Server operators can reconstruct the allowlisted initial input from the authorized source version. Grants are declarations requiring external validation, not machine-certified permissions. Do not send protected source provenance to a general student UI.

## Trust contract

The shared `knowledge-sql.ts` predicates drive both retrieval and real coverage. They require the latest relevant shared statement, current processing/sharing permission, current catalog eligibility and evidence. Revoking the latest statement never falls back to an older source. Candidate revisions remain historical.

`proof-reviewed` requires a complete candidate, the stored proof-review status, passing sample prediction comparison, separate critique, named passing proof review and no failed verification evidence. The proof-review mutation additionally checks unresolved claims/uncertainty, critique coverage, source currency and eligibility. Prediction comparison is explicitly **not program execution**.

`training-ready` additionally requires executed sample and differential evidence bound to the candidate hash, an independent named training review, no candidate uncertainty, at least one active primary-discovery concept and no inactive mappings. The training review checks present difficulty/purpose sections and matching implementation hashes for the executed suites. It records the reviewed concept snapshot; changing mappings, weights, facets or status invalidates this training approval until reviewed again. A failed later execution immediately removes retrieval trust.

Tests support a proof, but do not prove general correctness. Human reviewers must check the mathematical argument, implementation/proof correspondence and educational classification. A model confidence number, another model's agreement, schema validity or passing small tests cannot by itself establish either trust level. Review identities are operator attestations; qualified real review is still outstanding.

## Storage and performance

Existing entities available to Phase 5 are `cf_problems`, `cf_contests`, immutable `problem_statements`, `analysis_jobs`, `reasoning_analysis_versions`, `mathematical_discoveries`, `reasoning_concepts`, `reasoning_concept_relationships`, `problem_concept_relationships`, `reasoning_verification_results` and `reasoning_model_usage`. Batches use `analysis_batches` and `analysis_batch_items`. Evaluation runs/cases/calls/reviews are separate and are never silently published as knowledge.

Stable catalog keys, source hashes and analysis keys deduplicate data. Existing problem/status, source, discovery and concept lookup indexes plus the new analysis-to-concept index support retrieval. Search performs a bounded page query and batched concept/relationship reads rather than one query per candidate. Related search is bounded to 20 shared concepts; it is not a vector search. No full-corpus performance benchmark is claimed while the real analysis tables are empty. Recheck query plans with representative populated data before production load.

## Reusable fixture demonstration

Run from the project root:

```powershell
npx tsx --test --test-concurrency=1 tests/reasoning-knowledge.test.ts
```

`tests/reasoning-fixtures.ts` supplies original MIT synthetic statements, structured solutions and scripted critique responses. The E2E test creates a disposable database, registers two catalog fixtures, runs solve → classify → blind derivation → critique, executes the bounded identity implementation on the sample and all 101 legal integers, records clearly simulated proof/education review attestations, maps concepts and retrieves training-ready fixtures. It checks all filters, safe DTO fields, deduplication, coverage, budgets, interruptions, taxonomy normalization, trust invalidation and batch resume.

Fixture retrieval is explicitly enabled only with:

```ts
const fixtureKnowledge = createKnowledgeService(pool, {
  fixtureMode: true, environment: "test",
});
```

The production/default service excludes synthetic and mock records. Fixtures never increase real Codeforces coverage. Do not enable test mode for production personalization or copy simulated human reviews into the operational database.

## Phase boundary

Level A permits Phase 5 engineering against these contracts. Level B requires authorized real statements, confirmed account model access and pricing, an approved and evaluated paid pilot, qualified review and measured real training-ready coverage. Presently no real candidate can be returned at the default training-ready level. Phase 5 must retain the deterministic baseline and clear missing-knowledge states until those external conditions are satisfied.
