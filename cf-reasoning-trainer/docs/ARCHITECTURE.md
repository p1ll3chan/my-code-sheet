# CF Reasoning Trainer — Proposed architecture

Phase 0 design, 2026-10-08. This describes the final direction; it does not claim implementation or authorize another phase. Keep a small modular monolith: React + TypeScript + Vite client, Express API, Drizzle ORM and one independent PostgreSQL database. Use the existing Wouter, TanStack Query, Tailwind/Radix UI, Passport Local and bcrypt foundations after repairs.

Phase 4A design supplement (2026-10-15): [analysis contracts and persistence proposal](ANALYSIS_SPEC.md), [controlled taxonomy](REASONING_TAXONOMY.md), [verification and publication gates](VERIFICATION_SPEC.md), and [pilot evaluation](ANALYSIS_EVALUATION.md). These refine the reasoning domain below without enabling inference, a worker or schema migrations. The proposed evidence state `proof-reviewed` replaces the ambiguous earlier shorthand `verified`.

## Runtime and boundaries

The browser calls the same-origin Express API with an HttpOnly session cookie. Express validates request DTOs, authenticates sessions, enforces owner-scoped private access, and delegates to small domain services. PostgreSQL persists shared catalog/knowledge and separate private account/training records. Serve the production client from Express as the current build already intends.

Start with the existing `client/`, `server/routes`, `server/controllers`, `server/services`, `shared/` structure. Separate shared API DTOs from database row types: a full user row is never an API response. Keep secrets and raw private state out of client bundles/logs. No SSR framework, separate frontend service, message broker, vector store or microservices are needed for the initial product.

Planned domains:

| Domain | Responsibility and boundary |
| --- | --- |
| Accounts/auth | Fresh local accounts, public user DTOs, timezone, secure persistent sessions, private goal/profile ownership; no mentor/club roles |
| Codeforces adapter | Server-only official metadata/profile/rating/contest/submission access with typed parsing, pagination, bounded retries, caching and rate limiting; mock implementation during development |
| Catalog | One global canonical problem record per Codeforces identity; current metadata/version, eligible rating and public contest context; no per-user status on shared rows |
| Statement registry | Authorized statement versions and provenance, permission basis, source attribution, locale, content hash; revocation/expiry handling; no scraping fallback |
| Reasoning knowledge | Independently derived classification and mathematical insights, model/prompt/schema versions, statement hash, uncertainty, evidence and verification status; shared only when rights permit |
| Profile sync | Individual rating history, Codeforces contest participation and submission mirrors associated privately with an account; do not expose other accounts through API |
| Training scheduler | Deterministic versioned selection from eligible catalog and accepted knowledge snapshots using private progress, target rating, deadline, capacity and time budget |
| Session tracking | Durable thinking intervals, pauses, discovery events, assistance events and implementation state; server validates timing/idempotency; self-report distinguished from imported judge evidence |
| Progress | Private streaks, mastery, time/discovery/implementation summaries and personal achievements; no public competition or shared standings |
| Refresh jobs | Weekly metadata/knowledge refresh orchestration with persisted state, deduplication, leases, retry/checkpoints and explicit cost/access gates |

## Proposed data model

Only the minimal account/catalog/private-record foundation belongs in Phase 1. Add the remaining tables via reviewed migrations in their authorized phases.

| Scope | Tables/concepts | Required invariants |
| --- | --- | --- |
| Private account | `users`, `sessions`, `training_goals`, `user_cf_profiles` | Separate password hash from public DTO; FK account ownership; one active goal policy explicit; target/deadline/capacity validation; timezone stored |
| Shared metadata | `cf_contests`, `catalog_problems`, `catalog_refresh_runs` | Stable unique `(cf_contest_id, problem_index)` for eligible regular problems; integer rating 1200–2000 inclusive for active analysis/training; unrated/out-of-range entries quarantined or made ineligible; version/update timestamps |
| Authorized content | `problem_statements` | FK canonical problem; source/permission/attribution/locale/version/hash required; immutable versions; authorized status gates analysis and access |
| Shared knowledge | `reasoning_analyses`, `mathematical_insights`, `verification_evidence` | FK exact statement/analysis version; model/provider/prompt/schema versions; independent labels, uncertainty and explicit state; verification requires evidence links and method/reviewer provenance |
| Private CF history | `user_rating_history`, `user_contest_history`, `user_submissions`, `profile_sync_runs` | Unique external identity per account; idempotent upserts; imported verdict/source timestamp retained; pending/rejudged verdicts refreshable; CF runtime is not thinking time |
| Private training | `daily_assignments`, `training_attempts`, `thinking_intervals`, `assistance_events`, `discovery_events`, `implementation_events` | User FK on owned records; assignment references shared problem; unique daily slot/request IDs; at most one active thinking interval per attempt; end ≥ start; retries do not duplicate time/rewards |
| Private progress | `mastery_snapshots`, `achievement_events` | Versioned calculation inputs; first independent discovery/solve rewards idempotent; no public score table |
| Shared operational | `refresh_jobs`, `trend_snapshots` | Run uniqueness/leases and bounded retries; metadata jobs separate from analysis jobs; failed refresh retains last good data; sample counts/coverage/window/version shown for trends |

Use explicit SQL foreign keys/checks/uniques/indexes and transactions. Use timezone-aware timestamps for instants and a local date plus account timezone for daily assignments. Keep archival versions for reproducibility rather than rewriting evidence beneath past assignments. Private child-record access must validate ownership through the account, not merely possession of a record ID.

A shared catalog is compatible with a single-player product and multiple private accounts. Public CF source information does not make account-linked imports, goals, notes, timers, assistance or training history public. Linked CF handles are for personalization; until verified, do not claim account ownership or request restricted data on that basis.

## Metadata, statements and classification isolation

The official [Codeforces methods](https://codeforces.com/apiHelp/methods?locale=en&mobile=true) describe `problemset.problems`, `user.info`, `user.rating`, `user.status` and `contest.list`. The documented [Problem object](https://codeforces.com/apiHelp/objects?locale=en) does not include statement content. Infer metadata access and statement authorization as separate integration boundaries; a metadata API response does not grant a statement corpus.

Use public regular-contest metadata first, not private gyms/groups, source-code extraction, editorials or tags as a shortcut. Request only needed public fields. Validate handles and fixed upstream URLs; use `includeSources=false`/default exclusion and do not collect submission source code for the initial scope. Confirm current official API restrictions before live integration; cache/back off on 403/429/outages without circumventing them.

Initial classification input is a strict allowlisted analysis DTO containing only authorized statement text and necessary constraints/examples, plus safe provenance/version identifiers. Exclude Codeforces tags, editorial text/links, solutions, and submission-derived hints. Rating/title/other metadata should be omitted from classification input unless a later approved policy explicitly needs it; rating filtering belongs in catalog eligibility. Avoid preserving upstream tags in the analysis-accessible schema. Test that excluded fields never enter prompt serialization.

Authorized statements can come from an explicitly permitted source or user-provided material with a recorded permission basis. Unclear rights leave analysis blocked. User-supplied private content remains private unless permission covers sharing it as catalog knowledge. Sanitize statement HTML before display; treat statement text as untrusted data when sending to any model. Preserve attribution and authorization scope across derived knowledge.

## Mathematical analysis and verification

Phase 4B implements this boundary in `server/reasoning/` with additive migrations `0003`–`0004`. The shared catalog remains the problem identity source; operator-registered statement versions carry explicit processing/sharing grants. Jobs are unique by statement, prompt/schema, mode, tier and model, and use PostgreSQL leases. The primary and blind calls receive only a strict statement DTO; the critique receives frozen candidates and scoped evidence. Usage rows retain model, prompt and input/output hashes, token counts and reserved/actual cost. Mock and dry-run are the defaults. Authenticated retrieval only serves current shared, named human-proof-reviewed versions. Sample-prediction comparison is the only implemented deterministic check; executable edge-case/differential verification remains future work. No background or bulk paid worker is installed. See [Phase 4B pilot gates](PHASE4B_PILOT.md).

LLM analysis is an optional server-only adapter, disabled/mocked until the phase explicitly permits requests. Bulk analysis additionally needs explicit approval. Each run stores model/provider, prompt and output schema versions, source hash, uncertainty, timestamps and usage/cost when applicable. Keep proposed classifications separate from accepted knowledge.

Evidence states should distinguish `unreviewed`, `tested`, `verified`, `disputed` and `rejected` (final names can be agreed when implemented). A tested example or exhaustive small-case check is evidence of that bounded property only. General mathematical verification needs recorded proof/review or appropriate independently checked evidence. Do not promote all model output to verified, infer independent discovery from an accepted submission, or silently update prior claims when statements change.

Any automatic knowledge refresh may update metadata and identify stale/pending analyses without invoking a paid model. If analysis authorization or a current cost budget is absent, persist a blocked/pending job instead. Verified knowledge remains tied to exact statement/evidence versions; changed inputs invalidate or trigger review of dependent claims.

## Deterministic personalization and time tracking

Version the scheduler as a pure decision function over a frozen catalog/knowledge snapshot, user history, goal/deadline, available minutes and explicit clock/date. Apply rating eligibility (1200–2000 inclusive), avoid already independently mastered/recently assigned problems, balance reasoning weaknesses and workload, and record selection explanations and input versions. Use stable tie-breaks/seeded randomness; the same inputs must reproduce assignments. Handle empty catalogs and infeasible deadlines honestly instead of guaranteeing a target rating.

LLM services do not decide daily assignments or mutate progress. Recent problem-style trends may provide a versioned feature snapshot based on independently derived labels, recency weighting and coverage; official tags/editorials must not contaminate initial classifications. Separate metadata coverage from analyzed/verified coverage so trends do not imply an unbiased full corpus.

Use monotonic browser timing for display plus persisted, server-validated start/pause/resume/stop events with idempotency keys. Count active thinking intervals only; treat implementation time separately. Persist independent-discovery claims, hints/editorial/AI/other assistance events, and implementation milestones independently from CF verdicts. Record corrections/conflicts rather than silently double-counting multiple tabs or offline retries. Manual reports must remain identifiable as reports.

## Weekly refresh and operational simplicity

Design one explicit scheduler/worker entry point within the same repository and database. A small job table and PostgreSQL leases are sufficient initially; no additional queue service. A later approved deployment can trigger the weekly orchestration with its native scheduler. Multiple invocations must claim one run safely; restart resumes checkpoints and keeps last successful data visible.

Refresh catalog metadata weekly, synchronize requested profiles at a bounded cadence, and mark knowledge stale/pending when source versions change. Weekly knowledge refresh must respect statement permissions and AI authorization; it does not authorize bulk model work. Jobs are off by default in development and Phase 1. No scheduler is installed or activated during this audit.

## Security and verification boundaries

Require a fresh server-side session secret and persistent PostgreSQL session storage; use explicit HttpOnly/secure-in-production/SameSite/expiry settings and documented trusted proxy configuration. Test Passport login rotation and logout invalidation. Enforce CSRF/origin checks on cookie-authenticated mutations, auth throttling, bounded input/output schemas and owner-scoped queries. Clear private client caches on account changes. Log request metadata with redaction, not response JSON or credentials. Use sanitized error handling without throwing after a response.

Future verification should cover deterministic scheduling boundaries/reproducibility, two-account API/cache isolation, migration constraints/reapplication, CF adapter pagination/retry/rejudge behavior, statement authorization and prompt exclusion, timer overlap/retry correctness, and reward idempotency. Smoke-test the reused UI with a disposable database. Phase-specific tests should establish behavior rather than mirror implementation, and every handoff records what actually ran.

No spreadsheets, Kanban, mentors, clubs, social leaderboards or contest-hosting subsystem are part of this architecture. Analysis of a user's historical Codeforces contests is an import/analytics function, not a hosted contest feature.
