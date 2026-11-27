# Migration plan

Status: proposed after Phase 0; implementation requires Phase 1 approval. Source is `../my-code-sheet` relative to this project. Source stays read-only.

## Safe independent project

1. Establish the new project root as `G:/CF_Practice_Setup/cf-reasoning-trainer`. Carry the workspace development instructions forward and retain the source MIT license/copyright for reused code. Record source commit `db1f5c9` in provenance documentation, without copying Git remotes/config/history.
2. Before copying, create destination ignore rules for real `.env`/variants (permit a handwritten `.env.example`), database files/WALs/dumps, logs, uploads, credentials/keys, build output, node_modules and local tooling directories. Ignore rules do not replace reviewing a copy manifest.
3. Use a positive, file-by-file allowlist. Copy reviewed source/config/license files only. Never bulk-copy the directory or run `git clone` into the destination. Reject symlinks/reparse points and external paths; validate resolved source/destination paths. Exclude `.git`, `.env`, `dev.db`, dumps/backups, local/editor/agent settings, `.claude`, skills-lock, `vjudge-reference`, attached assets, uploads/logs/caches, generated outputs and dependency directories. Inspect each selected file for embedded credentials; the inherited session fallback must not be carried into a usable auth configuration.
4. Retain `client/src/main.tsx`, UI/utilities/styles and the useful provider/layout/build patterns described in `PHASE0_AUDIT.md`. Adapt shell navigation, dashboard markup, auth forms and contract patterns. Preserve useful code rather than translate it to a different framework.
5. Omit old sheet/problem CRUD services/schema, spreadsheet import, mentor roles/fields, hosted-contest/scoring/matchmaking/leaderboard modules, and unimported `server/storage.ts`. Do not bring excluded APIs online temporarily. Extract presentation primitives from old pages where useful; do not keep those product pages as active routes.
6. Regenerate/review a lockfile for the retained manifest, explicitly declaring direct dependencies. Initially preserve compatible existing library versions; pin a supported Node runtime and repair actual compiler issues. Remove packages only as their imports/config uses disappear. Do not introduce a new app framework, vector database, Redis, message broker or paid service for bootstrap.
7. Write `.env.example` from known configuration variable names and placeholders, without reading/copying original values. Generate a new session secret and provision an independent PostgreSQL database with new credentials. Keep credentials server-only; no `VITE_` secret variables. Do not print connection URLs. Migration credentials and runtime permissions should be separated where practical.
8. Validate the copied-file manifest, dependency graph, secret scan, type-check and production build. Use synthetic users/problems only. No old `.env`, DB, cookie, session or real user data enters this project. Initializing new Git history, committing/pushing and deployment remain subject to explicit permission.

## Database decision and migration safety

Use PostgreSQL + the existing Drizzle PostgreSQL dialect. The old schema uses PostgreSQL arrays, serial columns and timestamp defaults, and runtime imports `node-postgres`. The empty SQLite artifact is not a migration source. Do not add SQLite compatibility code or use `better-sqlite3` as an expedient fallback.

Create a fresh schema organized around accounts, public catalog and private history. Carry forward schema/type-definition patterns rather than old sheet/contest tables. Include explicit SQL foreign keys, unique constraints, checks and indexes. Use timezone-aware instants; personal day boundaries derive from the account timezone.

For the approved Phase 1 baseline:

- Reviewed migration SQL and Drizzle snapshots/journal are versioned; use the installed version's `generate` then `migrate` workflow. Do not run `db:push` against a populated or original database. Drizzle documents this file-based workflow in its [migration fundamentals](https://orm.drizzle.team/docs/migrations).
- Validate a new database target by an explicit non-secret database identity check before applying migrations. Refuse the original database identity. A future implementation should not rely on a name suffix alone.
- Test migrations from an empty disposable PostgreSQL database, then run the migration command again to confirm it is a no-op. Verify real foreign keys, uniqueness, rating/time checks, indexes and session table exist. No migration is applied during Phase 0.
- Seed only unmistakably synthetic metadata and fabricated account records. Add at least two test accounts to prove privacy boundaries. Do not claim fixtures are authorized real CF statements.
- For later populated-database changes, back up securely, test restoration in an independent disposable database, use additive expand/backfill/validate/contract changes, and retain compatibility until verified. Backups never enter Git. Multi-record application operations use transactions and idempotency constraints.
- A failed initial migration can discard only the explicitly disposable target and rerun; a populated production database requires restore or a reviewed forward repair. Do not promise automatic destructive down-migrations or reset the original.

ORM `relations()` do not create SQL foreign keys; define constraints explicitly, as distinguished in the official [Drizzle relations documentation](https://orm.drizzle.team/docs/relations). Use the installed stable API rather than copying examples for newer release candidates.

## Optional historical data import, separately authorized

No import is necessary to preserve working code. If the owner later requests their old records, first obtain the scope and a sanitized export prepared by an authorized operator. Do not connect using the tracked environment file.

Import only the consenting user's records through a reviewed script into staging. Map users and stable `(contestId, index)` problem identities; deduplicate problems across sheets and revalidate rating eligibility against the catalog. Reject arbitrary URLs/non-CF identities, unsupported ratings, orphaned relations and ambiguous problem mappings; emit aggregate counts and redacted reasons. Treat old `Solved` fields as self-reported, not verified CF acceptance or independent reasoning. Do not invent historical thinking time, assistance, discovery or implementation evidence.

Do not import passwords/hashes, sessions, clubs/mentor assignments, other users' records, hosted contests, public standings, raw logs or secrets. Start fresh accounts or use a separate explicit account recovery/import policy. Use a transaction and an import-batch identity so retries are idempotent; reconcile counts and spot-check synthetic rehearsals before any consented real import. Retain source data untouched and isolate any export outside the repository with a defined deletion policy.

## Ordered Phase 1 task breakdown

Phase 1 is a secure, independently runnable foundation. CF synchronization, mathematical analysis, adaptive scheduling and gamification are later work. These acceptance criteria are proposed for approval, not authorization to start.

| Order | Task | Concrete acceptance criteria |
| --- | --- | --- |
| 1 | Establish project boundary and sanitized copy manifest | Source Git status and reviewed-file hashes unchanged; destination contains only approved source/config/license/docs; no `.git` history, `.env`, DB/dump/private settings or reference gitlink copied; exclusions/secret scan reviewed; MIT notice retained |
| 2 | Recover minimal toolchain and application shell | Explicit supported Node version; direct `pg`/types and adapter `nanoid` dependencies declared if used; clean lockfile install, `npm run check`, `npm run build` all exit 0 on target Windows setup; portable dev/start scripts; excluded product routes not registered; no unresolved module/type errors |
| 3 | Add independent PostgreSQL baseline migrations | Fresh target uses new credentials; migration SQL/journal reviewed; empty-DB apply succeeds and repeat is no-op; accounts/session, catalog and minimal private-history tables enforce FK/unique/rating/nonnegative-time constraints; no original DB connection; tests verify constraints |
| 4 | Repair authentication/session boundary | Strict register/login DTOs; role/mentor/owner fields rejected; bcrypt preserved with bounded password policy; public DTO excludes hash; missing secret fails closed; PostgreSQL session store persists across app restart; secure production cookie policy; CSRF/origin protection and auth throttling tested; login session rotation and logout invalidation verified; logs contain no response bodies/secrets |
| 5 | Add a minimal private API boundary and cache isolation | One synthetic private history read/write path scoped by session user ID; unauthenticated request gets 401; account B cannot read/update/delete account A's record (including forged IDs/body ownership); invalid inputs get sanitized 4xx; forced DB failure produces sanitized 500 without crashing; logout/account switch clears private cache; no leaked hashes in JSON or logs |
| 6 | Complete a trainer shell using reused UI | Auth, personal dashboard and catalog/training placeholders for future work show honest empty states; no fake verified insights or claims of live CF data; no sheets/Kanban/club/mentor/social standings/contest hosting navigation or endpoints; loading/error/empty states and narrow-screen layout checked |
| 7 | Define mock adapters and statement authorization contract | Typed CF metadata/profile/submission fixtures exercise unrated/out-of-range/missing-verdict/API-failure cases; no network job runs by default; statement provenance/permission/hash contract documented; initial classification input excludes tags/editorials; missing statement authorization blocks analysis; no AI SDK call or paid request |
| 8 | Verify and hand off | Clean install/type-check/build and focused auth/privacy/migration tests pass; local smoke test uses disposable DB only; scan review confirms no private artifacts; source unchanged; update phase status with exact checks/limitations and stop for approval |

If a required resource (for example disposable PostgreSQL) is unavailable, report the affected criteria as unmet. Do not substitute a mocked database result for a real migration test. Statement permission is required before real analysis, but does not prevent completing a mock-based Phase 1 foundation.

## Later sequencing, not authorized now

After approval and Phase 1 acceptance: public CF metadata/profile sync and a persistent catalog; consented statement ingestion and evidence-backed reasoning analysis; deterministic personalized scheduling and timer/assistance events; recent-style aggregation, weekly refresh and private gamification. Each requires its own scope, tests and acceptance gate. No automatic transition or background job activation.
