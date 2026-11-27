# Independent mathematical analysis specification

Phase 4A design proposal, 2026-10-15. Applies to all nine bands, 1200 through 2000 inclusive. This phase introduces documents and executable contract definitions only: no worker, endpoint, migration, provider SDK, inference or ingestion is enabled.

## Fit with the application

Retain the React/Vite, Express, Drizzle/PostgreSQL modular monolith. Reuse `server/codeforces/catalog.ts` and `cf_problems` for canonical problem identity and current eligibility. Reuse owner-scoped account access patterns and additive migration tooling. Keep `server/training/planner.ts` deterministic and unchanged. Do not reuse imported submissions as reasoning, independent-solving evidence or statement authorization.

Proposed flow: catalog eligibility → statement authorization → immutable content version → blind analysis of the mathematical pivot **and predicted student bottleneck** → frozen candidate → independent verification → reviewed concept normalization/similarity → accepted knowledge snapshot. Verification may request a new candidate revision; it never edits a frozen candidate. An eventual knowledge refresh only schedules permitted work. It does not confer paid-inference or bulk-analysis approval.

No new service is necessary. A later approved worker can claim PostgreSQL jobs with leases and bounded retries, and call a server-only model adapter. Separate execution of untrusted generated programs needs a constrained execution environment; the current Express process and application database host are not that environment.

## Source authorization and isolation

Create a statement registry before any real analysis. Record canonical problem key, immutable statement version, locale, full content hash, source URI, attribution, authorization evidence reference, approving actor/time, allowed actions (processing, storage, display, derived-knowledge sharing), scope (`shared` or a specific private owner), and expiry/revocation. An official metadata API response, an accessible URL, or a user pasting text is not by itself documented permission for every action. Unclear rights block the job; ask for a permitted source instead of scraping. Preserve diagrams/format semantics where required; missing or ambiguous content blocks analysis until resolved. Do not silently OCR, translate or truncate it.

Eligibility uses the current `cf_problems` record and rating snapshot: published integer rating in [1200, 2000], present in the training catalog. Pilot sampling uses nine exact hundred-point bands; unexpected intermediate published ratings require an explicit sampling policy, not rounding inside the analysis prompt. Missing/out-of-range ratings are excluded from new analysis, with a recorded reason. Old knowledge is retained as authorized history, made unavailable to current training if eligibility changes. Historic user submission data remains intact.

The proposed `AnalysisInput` contract is a **strict allowlist**: schema version, opaque statement-version reference, content hash, locale, statement text, input/output specification, constraints and sample inputs/outputs with authorized explanations. No catalog key, problem title, rating, tags, editorial/solution/community URLs or text, prior reasoning labels, user information, submitted source or training history. Internal provenance remains in a server envelope and is never blindly serialized. The content hash covers the canonical content fields (fixed key order, UTF-8, LF normalization, preserving mathematical whitespace), not the envelope.

Allowlisting fields cannot detect excluded information embedded in statement text. An intake reviewer checks that the extract is the authorized statement, including only its actual examples; strips navigation/tags/editorial fragments; records any transformations and their hashes; and checks completeness against the authorized source. Redact identifiers only where this does not change problem meaning. Quarantine ambiguous extra commentary. Examples may themselves reveal observations; preserve legitimate statement examples and record this limitation.

The primary model has no browser, retrieval, repository tools, previous problem memory store or user profile. Start a fresh context for every independent derivation. Treat statements as untrusted data; instructions embedded inside them cannot override the analysis policy. Log input/output hashes and policy checks, not private content or secrets. Perfect independence cannot be guaranteed: pretraining may already contain the problem or solution. Call this **input-isolated derivation**, and record recognition disclosures rather than claiming novel human discovery.

## Fingerprint contract

See [executable design contracts](design/reasoning-contracts.ts), [primary prompt](prompts/PRIMARY_ANALYSIS.md), and [verification prompt](prompts/INDEPENDENT_VERIFICATION.md). Contracts use the already installed Zod package and are not imported by application runtime code. They validate structure and graph references, not mathematics or permission. The prompt's output contract is `AnalysisCandidate`; metadata, normalization and verification are separate envelopes.

Each section is `present`, `not-applicable`, or `unknown`; missing data is never an unexplained empty string. `not-applicable` and `unknown` require a reason and null content. Partial analyses may retain useful facts but cannot enter accepted solution knowledge. No numeric confidence field is used as a correctness signal.

| Requirement | Candidate field and interpretation |
| --- | --- |
| Core mathematical discovery | `coreDiscovery`: scoped proposition, consequence and claim references; not a broad category |
| Misleading initial formulation | `initialFormulation`: what the student sees and what obscures the structure |
| Naive approaches and limitations | `naiveApproaches`: attempted method, complexity/counterexample and failure reason |
| Why a student gets stuck | `discoveryBottlenecks`: predicted assumption, tempting move, source of temptation, concrete failure witness, diagnostic question, exact pivot observation IDs and explanation of how the pivot resolves the failure; required for `complete` |
| Equivalent transformations | `transformations`: original/reformulated statements, domain restrictions, direction(s), supporting claims |
| Essential observations | `observations`: ordered ID, proposition, role, dependencies and supporting claim IDs |
| Observation dependencies | Earlier-node-only DAG; distinguish essential from supporting nodes; no circular “proof” |
| Necessary/sufficient conditions | `conditions`: predicate, target property, direction (`necessary`, `sufficient`, `equivalent`), domain and claim IDs; equivalence requires both directions in proof |
| Invariants/extremal/structure | `structuralProperties`: exact property, assumptions and claim IDs; not required for every problem |
| Derived algorithm | `algorithm`: ordered steps, each grounded in observation IDs; termination claim |
| Correctness proof | `proof`: precise theorem and obligations linking claims, assumptions and proof arguments; explicit unresolved obligations |
| Complexity | `complexity`: variables, time/space bounds, justification and claim IDs; count all test cases and numeric bounds |
| Implementation difficulty | `implementationDifficulty`: anchored 1–5 ordinal estimate and rationale; independent of CF rating |
| Independent discovery difficulty | `discoveryDifficulty`: anchored 1–5, likely obstacle, explanation; an estimate for a stated learner background |
| Proof difficulty | `proofDifficulty`: anchored 1–5 and rationale |
| Prerequisite reasoning skills | `prerequisites`: free-text required knowledge and why; normalized later |
| Transferable concepts | `transferableConcepts`: reusable action/concept, limits and observation references |
| Discovery-level similarity | Separate `SimilarityProposal` after blind analysis, with observation correspondences; initially absent, never supplied to primary model |
| Suitable training purpose | `trainingPurposes`: purpose, target observations, rationale; proposal only |
| Progressive hints | `hints`: increasing levels, intended reveal, observation IDs, prerequisite earlier hint IDs and spoiler level |
| Verification/uncertainty | `uncertainties` and candidate `complete/partial/blocked`; authoritative verification lives in a separate decision tied to immutable evidence |

All claims have stable IDs within the candidate, assumptions, a scoped assertion, justification text, dependencies and declared gaps. A claim may be derived from explicit statement assumptions; dependency-free does not mean verified. Observation dependencies describe pedagogical order; claim dependencies describe logical support. Both graphs must be acyclic, IDs unique and references resolvable. Model-produced difficulty values and hints are also reviewable proposals, not observed student metrics.

The bottleneck is the pedagogical center of the fingerprint. Its `failureWitness` must describe a legal counterexample, a reasoned complexity limit, a missing proof implication, or the representational mismatch under the statement's assumptions. A reviewer checks its validity. `diagnosticQuestion` is an actionable question a student could ask *before* knowing the answer; `pivotObservationIds` point to the first observation(s) that answer it. The `resolution` must explain the new capability those observations provide, not restate an algorithm tag. A complete candidate needs at least one such chain. It may have several for multi-observation problems, ordered by prerequisite observations. Generic text such as “greedy fails; use DP” is rejected even when the final algorithm is correct.

These bottlenecks are **predictions** for a learner with the stated prerequisites. A model is not shown any student's private notes or timer data, and it cannot report that real students made the proposed mistake. If a later consented student repeatedly records a different obstacle, retain the original prediction and record observed evidence separately, privately; use reviewed aggregate evidence to revise the shared teaching hypothesis without exposing an account's history. Success on Codeforces still does not prove independent discovery.

Difficulty anchors assume a learner familiar with the listed prerequisites: 1 direct recognition/routine coding/direct substitution proof; 2 one modest reformulation/few coding cases/short lemma; 3 linked observations/moderate state or boundary management/multiple proof obligations; 4 a concealed representation or interacting insights/error-prone implementation/subtle sufficiency or extremal proof; 5 unusually hard for this target audience. Rate the three axes independently with concrete reasons. Validate consistency through human review and eventual student outcomes, not CF rating alone.

Hints should move from attention direction, to a relevant quantity or relation, to the decisive observation, and only then to an algorithm outline. Fewer hints are fine; do not fabricate filler. Store each hint separately, hide by default, and require a deliberate reveal in a later UI. A wrong earlier hint cannot be repaired merely by a correct later one. Revealing any hint must record assistance privately; don't relabel the student's solve as independent.

## Provenance, publication and proposed persistence

The trusted orchestration envelope records analysis ID/revision, problem/statement FK and content hash, provider/model identifiers (including pinned revision where available), sampling settings, prompt version/hash, contract version, exact input/output hashes, input-policy version/result, run timestamps, nullable usage/cost, authorization grant, and recognition disclosure. Unknown provider metadata is explicitly unknown. Prompt text and model parameters are versioned artifacts. Retain failed attempts without promoting them, within authorized retention limits.

Proposed additive tables; **no migration is created in Phase 4A**:

| Table | Identity / key relationships / constraints |
| --- | --- |
| `problem_statements` | UUID PK, FK existing `cf_problems.key`; content/version/hash, permission metadata, scope + nullable owner FK with a check that private implies owner; unique problem/scope-owner/content-hash/locale (handle NULL shared owner explicitly); immutable content |
| `reasoning_analysis_runs` | UUID PK, statement FK; versioned envelope and candidate JSONB; unique idempotency key over statement hash, prompt/model/settings/policy, authorization scope and requested revision; never coalesce across owners |
| `reasoning_claims` / `reasoning_bottlenecks` | Composite PKs `(analysis_id, claim_id)` and `(analysis_id, bottleneck_id)`; frozen claim body and bottleneck explanation, observation links constrained to same analysis; bottlenecks are predicted, not observed student events |
| `verification_runs` / `verification_evidence` | Analysis FK and input hash, method/tool/environment versions, artifact hashes, bounded scope and outcomes; evidence ownership inherited from statement; no executable code in client DTOs |
| `knowledge_decisions` | Append-only actor/time, analysis FK, state, required evidence/review references, rationale and superseded decision FK; promotion is a trusted transaction |
| `reasoning_concepts` / `concept_assignments` | Immutable taxonomy version + ID, facet and review state; assignments link exact analysis/claim/observation/bottleneck and taxonomy version |
| `reasoning_similarities` | Pair of exact analysis versions, reviewed observation correspondence and differences; both access scopes checked |
| `knowledge_snapshots` | Approved selection of analysis/decision/taxonomy versions and eligibility/permission checks; assignments later pin a snapshot |

Index statements by problem/scope, analyses by statement/status, decisions by analysis/time, and mappings by concept/version. Use SQL FKs and transaction checks for ownership, immutable-version references and status promotion; JSON validation alone is insufficient. Use an explicit unique shared index plus a private-owner index where NULL semantics matter. Authorized private statement derivatives stay private and are excluded from global trends/caches. One shared problem record remains compatible with distinct authorized content versions.

Implement later via additive migrations tested on disposable PostgreSQL, then backfill only authorized metadata, validate constraints and deploy readers before enabling writers. Never reset catalog/private history. Application APIs need owner scoping, output projections, CSRF protections and pagination as in the current app. Review interfaces require explicit operator privileges; ordinary players and model adapters cannot promote knowledge.

## Invalidation and future scheduling

Statement edits create new hashes and new analyses; old evidence cannot transfer automatically. Prompt/model changes create candidates without destroying the last accepted version. Permission expiry/revocation immediately blocks access and execution; retain only legally permitted audit hashes/metadata and remove content/derivatives when required by the grant. New contradictions suspend affected knowledge and downstream hints/similarities/snapshots pending review. Rating updates affect eligibility, not whether a proof is true.

The later scheduler may consume only a rights-eligible, current, accepted snapshot; preserve Phase 3 fallback when unavailable. Reasoning-based weakness or trend claims require coverage counts and versioned mappings. Weekly refresh can mark stale entries and prepare proposals with zero inference. Actual paid or bulk work requires separate explicit phase approval, a bounded budget and stop conditions. No new worker or integration is authorized by this document.
