# CF Reasoning Trainer

Single-player foundation: React 18, TypeScript, Vite, Express, Passport Local, Drizzle and PostgreSQL. The application has five areas: Dashboard, Today's Training, Reasoning Profile, Progress and History, and Training Settings. Phase 2 imports the shared Codeforces problem catalog and each account's public handle, rating changes, contests and complete available submission history. Phase 3 adds private rating goals, deterministic daily assignments, a persisted practice timer and transparent training-progress heuristics. Phase 4B adds a server-side, disabled-by-default mathematical analysis pipeline; the UI has not been connected to it and no real problem has been analyzed. Gamification remains outside the implementation.

## Local setup (Windows)

Use Node **24.x** (validated with **24.21.0**, recorded in `.nvmrc`) and npm 11. Run commands from this directory. The original repository is not needed.

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run setup:local
npm run dev
```

Open <http://127.0.0.1:5000>. Use this exact origin, including `127.0.0.1`, for cookie/CSRF consistency. Register a new account with a password of at least 12 characters and no more than 72 UTF-8 bytes. Stop with Ctrl+C; the application and its local database shut down together. Client edits reload through Vite; restart the command for backend changes.

In Training Settings, enter a public Codeforces handle and select **Connect handle**. The initial import can take time for a long submission history because official API calls are globally spaced and submissions are paged. Dashboard then shows actual rating and submission counts; Progress and History shows rating changes, contest participation and pageable submissions. A handle is not proof of ownership, a public acceptance is not proof of independent solving, and contest elapsed time is not per-problem thinking time. The catalog is refreshed on demand when older than seven days. No problem statements, tags, editorials or submission source code are imported.

For an explicit metadata-only refresh, run `npm run catalog:sync -- --sync` while the local database is running; `--status` reads saved counts and `--if-stale` respects the seven-day cache. The command uses the existing shared Codeforces request gate and preserves the last successful catalog on failure. It never retrieves problem statements. After migration and sync, `npm run reasoning:plan -- --limit 50` shows read-only candidate counts and a bounded resumable page of keys; `--after <problem-key>` advances the page. It never enqueues or runs AI analysis. The protected `/knowledge-coverage` screen is linked from Reasoning Profile and reports actual persisted status. See [operational readiness](docs/PHASE4B_READINESS.md) for definitions and current limitations.

Set a target rating (1200–2000), date, daily minutes, preferred days, intensity, focus, difficulty progression and IANA time zone in Training Settings. Open Today's Training and generate the daily session. Recommendations are deterministic, use current catalog ratings and imported attempts, and avoid recorded solves and recently assigned problems. The timer records your own start, pause, resume, first observation, implementation, assistance and final outcome; it never infers thinking time from Codeforces submissions. Break/recovery/custom availability controls adjust today's unfinished work without adding tasks beyond capacity. The dashboard separates actual Codeforces rating from a heuristic practice-readiness band and labels training-pace status as adherence, not a rating forecast.

`setup:local` generates fresh credentials and a database identity in ignored `.env` and `.local/`. It initializes real PostgreSQL 17.10 on loopback port 55432 using the pinned development-only binary package, then applies the reviewed migration and stops the database. Running setup again preserves credentials and existing records. It refuses an existing database without its matching configuration. Do not create `.env` from the example before this automatic setup. No Docker, source-project database or source credentials are required.

The local `cf_local` database role owns the development cluster. This convenience setup is for this machine's development use only; use separate migration and restricted runtime roles for deployment. File modes do not replace Windows account/NTFS permissions. Keep `.env`, `.local` and database backups private. Do not delete `.local` to troubleshoot a populated database; restore the matching configuration or investigate the failure.

The automated Windows setup was tested. Other OS binary packages exist upstream, but this project's setup has not been validated on those systems. The ignored `.local/runtime` runtime used during implementation is not a project dependency or part of the distributable source; install/select Node 24 normally.

## Checks

```powershell
npm run check
npm test
npm run verify:files
```

`npm test` first builds the production client/server, then runs Node's test runner with real disposable PostgreSQL databases and synthetic accounts. Tests bind ephemeral loopback ports and clean up only their validated `.test-data/` directories. Network-restricted sandboxes may require permission for loopback connections. A mocked database is not substituted. `npm run build` can also be run separately.

## Reasoning pipeline (operator-only preview)

Apply the reviewed additive Phase 4B migrations before using this feature. An operator can register a rights-cleared statement JSON with `npm run reasoning -- register <file>`, enqueue its eligible shared problem with `npm run reasoning -- enqueue <problem-key>`, and process up to `AI_BATCH_SIZE` queued jobs with `npm run reasoning -- run`. The JSON must supply the canonical catalog problem key, complete statement, input/output specifications, constraints, examples, explicit comparison mode, attribution, dated grant reference and processing/sharing scope. There is no Codeforces statement downloader. Private statement sources cannot enter the shared job queue. The default mock records an honest blocked analysis; fixture tests inject a synthetic answer. Human proof promotion is a separate named `review` command and is not automatic. Authenticated retrieval exposes only shared, proof-reviewed records; the five application pages are unchanged.

The defaults in `.env.example` disable AI and dry-run mode remains on. A future live run additionally requires an explicit approved problem allowlist and approval reference, a server-only API key, exact account-available model IDs, confirmed current input/output prices and a positive cumulative cap. The server preflights each configured model through the provider's models endpoint. A paid call with ambiguous completion or interrupted persistence blocks replay pending operator reconciliation; there is no unattended paid worker. See [Phase 4B pilot gates](docs/PHASE4B_PILOT.md) before considering any live use.

`verify:files` checks the distributable source for prohibited artifacts, known credential patterns, placeholder configuration and dependencies on the old project. It intentionally excludes generated local state and is not a comprehensive secret detector. Review the actual staged file list before any future commit. No Git repository/history was copied or initialized during this phase.

## Dataset import (Phase 4.5, operator-only)

Statements and official tests come from the Hugging Face dataset `open-r1/codeforces`, pinned to one revision and imported for personal use. The card lists the license as cc-by-4.0 (header) and ODC-By 4.0 (body); problems remain © Codeforces. Imported statements are `licensed-dataset`, shared by local accounts and never served to clients. Editorials and tags go to a quarantined table that analysis never reads.

```bash
REV=fbe3f6e903ee854eec2e69e9d96d0306cde59baf
DIR=.local/datasets/open-r1-codeforces/$REV
# 1. Download the default config (12 parquet files, ~2.8 GB) into the ignored .local folder.
mkdir -p $DIR/data && for f in test-00000-of-00001 $(seq -f "train-%05g-of-00011" 0 10); do
  curl -sSL --fail -o $DIR/data/$f.parquet "https://huggingface.co/datasets/open-r1/codeforces/resolve/$REV/data/$f.parquet"; done
# 2. Convert to JSONL once (no npm dependency; needs uv). Also writes codeforces.jsonl.manifest.json.
uv run --no-project --with pyarrow python -I script/dataset-to-jsonl.py $DIR/data $DIR/codeforces.jsonl $REV
# 3. With the local database running (npm run db:local), import. Rerunning is idempotent.
npm run dataset:import -- import $DIR/codeforces.jsonl --dataset-ref $REV
```

The import runs in one transaction and prints a report with a count and the first 20 keys for each skip reason. It refuses to start unless the manifest's revision equals `--dataset-ref`, and rolls back if the row count or sha256 differs from the manifest. A row with wrong field types, null characters, unpaired surrogates, malformed JSON, an oversized line or a revoked problem is skipped with a reason. Revoking any dataset statement for a problem blocks later revisions of it, and a skipped problem loses its current test set. A malformed or zero-byte test suite leaves the problem with no test set (counted as `testsIncomplete`; suites the converter dropped for exceeding 8 MB are counted as `testsOversize`), and out-of-range limits are stored as null. Problems with a checker, interaction or file I/O are recorded as checker-required and get no current test set. Each problem has at most one current test set (`problem_test_sets.is_current`); older sets stay for history.

A problem that already has an operator-approved or fixture statement is skipped (`other_source_present`), so the import never replaces one. `licensed-dataset` statements can only come from this import; `npm run reasoning register` refuses them. On failure the CLI prints only the Postgres error code and constraint name, never row content.

## Mathematical quality evaluation (operator-only)

Apply migration `0005_mathematical_evaluation`, then use `npm run reasoning:evaluate -- manifest`, `plan`, `create-mock`, and bounded `run-mock <run-id> 50` commands. `export <run-id> .local/report.json` produces metrics; adding `blind` exports review packets. `review <case-id> .local/review.json` records an immutable named assessment. The benchmark contains original fixtures with uncalibrated difficulty, not rated Codeforces problems. Mock completion is not mathematical acceptance.

See [quality evaluation and commands](docs/PHASE4B_QUALITY_EVALUATION.md), [review rubric](docs/MATHEMATICAL_REVIEW_RUBRIC.md), [benchmark](docs/PILOT_BENCHMARK.md), [cost/approval blockers](docs/PILOT_COST_ESTIMATE.md) and [proposed Phase 4C gates](docs/PHASE4C_QUALITY_GATES.md). Live evaluation requires an exact, explicitly approved plan and remains disabled by default. No paid pilot or full backfill is approved.

## Database changes

Review schema edits in `server/db/schema.ts`, then generate SQL with `npm run db:generate`. Review the SQL, snapshot and journal together. Applied migrations are immutable; add a new migration for subsequent changes. Do not use `drizzle-kit push` or destructive reset commands.

For the managed local database, stop `npm run dev`, run `npm run db:local` in one terminal, then `npm run db:migrate` in another. Stop the database terminal with Ctrl+C after migration. Startup does not apply migrations automatically.

For a separately provisioned **empty independent PostgreSQL** database, configure the variable names in `.env.example` with fresh values and a generated UUID `DATABASE_ID`. Run `npm run db:migrate -- --initialize` once. Initialization refuses a nonempty unmarked database; subsequent runs verify the stored project/instance identity before taking the migration lock and applying pending SQL. Do not point this project at the original database. Changing `DATABASE_ID` is not a database adoption mechanism.

Back up populated databases privately, test restoration separately, and use reviewed additive changes. A migration failure requires diagnosis and a forward repair or restore; no automatic rollback/reset is provided. Phase 2 adds `migrations/0001_codeforces_metadata.sql` for shared catalog/contest data and account-owned imports. Phase 3 adds `migrations/0002_training_engine.sql` for private goals, day overrides, sessions and assignment timers. Phase 4B adds `migrations/0003_eager_mercury.sql` and `migrations/0004_old_dragon_man.sql` for authorized sources, jobs, analyses, concepts, verification and usage provenance. Existing account, session, journal and import records are preserved.

## Production entrypoint

`npm run build` creates `dist/public` and `dist/index.js`; `npm start` runs the compiled server without Vite. Provision and migrate an independent PostgreSQL database first. Configure the validated server-only variables in `.env.example`; supply fresh random secrets through deployment configuration. Remote PostgreSQL requires `sslmode=verify-full`. No secret may use a `VITE_` prefix.

Production requires an exact HTTPS `APP_ORIGIN`. Use a TLS-terminating reverse proxy and keep Express bound to loopback. Set `TRUST_PROXY=loopback` only when that trusted local proxy removes/replaces forwarded headers and the backend cannot be reached directly. Otherwise leave `none`; untrusted forwarded headers will not enable secure cookies. Only the `none` and `loopback` topologies are currently supported. Production cookies are Secure, HttpOnly, SameSite=Lax and host-only, with an eight-hour absolute authenticated lifetime.

Install production dependencies from the lockfile for runtime; database migration/build commands need the development toolchain in a separate build/migration environment. Restrict runtime DB access to the required tables and session pruning, without schema creation privileges. General/authentication request limits remain in-process and assume one API instance; the Codeforces upstream request gate is shared through PostgreSQL. Actual TLS/proxy deployment and restricted production database grants have not been exercised.

See [security findings and validation](docs/PHASE1A_SECURITY.md), [source attribution](NOTICE.md) and [phase handoff](PHASE_STATUS.md). No deployment or production job is authorized by this document.
