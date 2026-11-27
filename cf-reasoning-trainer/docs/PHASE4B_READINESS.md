# Phase 4B-R1 — Operational readiness

Checked 2026-10-15 (Asia/Calcutta). This is metadata and coverage readiness only. **No paid model call, statement scraping, real-problem analysis, or full-corpus backfill occurred.** Phase 4C remains unapproved.

## Local database and catalog

Before migration, the identity-matched local PostgreSQL database had only migration `0000_secure_foundation` and **0 users, 0 private notes, 0 sessions**. A stale PostgreSQL PID was confirmed inactive with `pg_ctl status`; the existing cluster was recovered without deleting database files. Migrations `0001`–`0004` were reviewed and applied with the project's identity-checked migrator. They add tables, constraints and indexes; `0004` backfills provenance fields for any old usage rows before setting them non-null. No `DROP TABLE`, `DROP COLUMN`, delete or truncate is present. No user-data backup was needed because the local database contained no user records; no database reset occurred. Migration reapplication and data preservation are covered by integration tests. The local development cluster is not a production database.

The metadata-only `catalog:sync` command reuses the official Codeforces API client, its PostgreSQL-wide 2.2-second request gate, bounded retries and cache, and the transactional catalog upsert. A failed refresh leaves the last successful catalog intact and records an error; a retry is idempotent, updating changed ratings and deduplicating stable problem keys. A live sync initially failed, then succeeded on one retry. This service imports **no statements, tags for reasoning, editorials or source code**. The last successful sync was **2026-10-15 17:47:09 UTC** (23:17:09 IST).

| Persisted measure | Count |
| --- | ---: |
| Active problemset catalog entries | 11,457 |
| Eligible, published rating 1200–2000 inclusive | 4,453 |
| Unrated active problemset entries, excluded from eligibility | 305 |
| Active shared operator-approved statement versions for eligible problems | 0 |
| Eligible problems awaiting statements | 4,453 |
| Eligible problems ready for dry-run enqueue planning | 0 |
| Queued / analyzing | 0 / 0 |
| Complete analysis candidates / needing review | 0 / 0 |
| Documented mathematical proof reviews | 0 |
| Failed / blocked analysis stages | 0 / 0 |

Counts come from the migrated local database after successful metadata sync, not from a global Codeforces promise; future official rating changes can change the denominator. `cataloged` includes active problemset entries at any rating; `eligible` excludes unrated and out-of-band problems.

## Coverage definitions

`GET /api/reasoning/coverage` is authenticated and read-only. The auxiliary **Reasoning knowledge coverage** page is linked from Reasoning Profile; personal Reasoning Profile remains a personal empty state. The UI displays persisted counts and clearly distinguishes an empty catalog or a failed last sync. The API performs no upstream request.

The eight `stages` form an exclusive partition of eligible problem keys: `awaitingStatement`, `ready`, `queued`, `analyzing`, `needsReview`, `verified`, `failed`, and `blocked`. They always sum to `eligible`. A statement is countable only when its latest applicable version is shared, not revoked, marked processing/sharing allowed, and `sourceKind=operator-approved`. This is an **operator-declared grant**, not independent legal validation. `synthetic-fixture` versions never count toward real-problem statement or verification coverage.

`completedAnalysis` is a separate overlapping measure: a complete structured candidate exists for the current countable statement, regardless of proof-review outcome. `verified` requires a complete candidate, `proof-reviewed` status, passing sample-prediction comparison evidence, an independent critique record, and passing named human proof-review evidence. These are documented review conditions, **not an empirical guarantee that the mathematics is correct**. A changed current statement removes older versions from real coverage until reviewed again. Failed/disputed, blocked, queued and reviewing states are not called verified.

## Dry-run backfill readiness

`npm run reasoning:plan -- --limit 50 [--after problem-key]` prints a bounded page in stable problem-key order, total ready candidate jobs, already verified and awaiting-statement counts, and the catalog sync timestamp. It **only reads** the database. `candidateJobs` excludes verified, queued, running, failed, blocked and review-stage problems. Re-run from the beginning after catalog or source changes; page cursors describe the current snapshot, not a frozen long-term manifest. No full-corpus enqueue, automatic worker, paid call or offline provider batch path was enabled. The existing `reasoning run` command still processes only explicitly queued jobs within its configured cap.

At this snapshot, the dry-run candidate count is **0**, because none of the 4,453 eligible problems has a registered real authorized statement. This must not be interpreted as completed coverage.

## Remaining prerequisites

- Obtain and review explicit permissions to process, store and share each real Codeforces statement; operator-declared grant metadata alone is insufficient. Register only permitted statements. No bulk statement source exists.
- Complete and evaluate the approved Phase 4B real-problem pilot. Confirm the requested model IDs and structured-output support in the actual account, current prices and a concrete budget before any paid inference.
- Add execution-based edge-case/differential checks where feasible and qualified human proof/bottleneck review. Sample-prediction agreement and model critique alone do not prove mathematical correctness or measured student sticking points.
- For any later full-corpus run, implement a separately approved enqueue controller, provider batch option if suitable, progress monitoring, budget scopes and operator reconciliation of ambiguous paid calls. The present dry-run planner is deliberately not an execution path.
- Recheck catalog/coverage after later syncs. Operational backups, restricted production database grants, TLS/proxy setup and real-world scale remain deployment concerns.

Phase 4B-R1 meets technical metadata, migration, coverage and dry-run readiness goals. **It does not satisfy the real mathematical pilot or Phase 4C approval gates.**
