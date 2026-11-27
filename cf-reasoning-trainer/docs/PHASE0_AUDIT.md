# Phase 0 — Repository audit

Audit date: 2026-10-08 (Asia/Calcutta). Source: `G:/CF_Practice_Setup/my-code-sheet`, HEAD `db1f5c9` (2026-09-20). Destination: `G:/CF_Practice_Setup/cf-reasoning-trainer`.

## Decision and scope

Reuse the React/TypeScript/Vite frontend foundation, selected UI primitives, Express routing/service structure, Drizzle PostgreSQL integration, and bcrypt/Passport approach. Repair security boundaries and build configuration before exposing accounts. Replace the sheet-centered data model with a shared Codeforces catalog and private training records. Exclude spreadsheet workflows, mentors, clubs, multiplayer contests, hosted contests, and social standings.

The literal `../my-code-sheet` does not exist relative to the supplied shell directory `G:/CF_Practice_Setup`; it resolves correctly from the existing empty `cf-reasoning-trainer` directory. This audit uses those sibling project directories. No application implementation was started in the destination.

Evidence comes from tracked source, import inspection, Git filenames/history metadata, and isolated checks. “Implemented” below means a connected source path exists, not that a database-backed browser workflow passed. No original database or environment file was loaded. No Codeforces problem statements were fetched, and no AI requests were made.

## Actual inventory

| Area | Actual files and behavior | Assessment |
| --- | --- | --- |
| Frontend entry | `client/src/main.tsx`, `App.tsx`; React 18, Wouter, TanStack Query, TypeScript | Reusable application shell; role routing must change |
| Client state | `hooks/use-auth.tsx`, `use-sheets.ts`, `use-problems.ts`, `use-stats.ts`, `use-contests.ts`; `lib/queryClient.ts` | Real fetch/mutation hooks, not mock APIs; private cache handling needs repair |
| Forms and styles | React Hook Form, Zod, Tailwind 3, Radix/shadcn primitives, Lucide; `index.css`, `tailwind.config.ts` | Reusable form/layout patterns; external Google Fonts request present |
| UI components | 47 `components/ui/*.tsx` modules; 17 reachable from current frontend entry through static imports | Large unused template inventory; copy only reviewed needed components |
| Pages | Auth, student dashboard, mentor dashboard, sheet list/detail, contest list/detail, not-found | Sheet and contest features conflict with target scope; dashboard visuals reusable |
| Backend entry | `server/index.ts`, `routes/index.ts`, `vite.ts`, `static.ts` | Express 4 + Node HTTP server, Vite middleware in development, static client in production |
| Layers | Four route modules, four controllers, four services; `middlewares/auth.middleware.ts` | Clear small structure worth keeping; validation not enforced at boundary |
| Auth | `passport.ts`, `auth.controller.ts`, `auth.service.ts` | Passport Local, bcrypt cost 10, numeric user ID stored in session; unsafe user responses and session settings |
| Database | `server/db.ts`, `shared/schema.ts`, `drizzle.config.ts` | PostgreSQL Pool + `drizzle-orm/node-postgres`; PostgreSQL schema, not SQLite |
| Contracts | `shared/routes.ts`, `shared/schema.ts` | Useful shared-contract pattern, but many responses use `z.custom`/`z.any`; client parsing does not secure the server |
| Duplicate persistence | `server/storage.ts` | Unimported `DatabaseStorage` implementation duplicates services and has divergent statistics behavior |
| Tooling | `script/build.ts`, Vite, esbuild, `tsconfig.json`, package manifest/lock | Build and type-check scripts; no test or lint script and no test suite found |
| Reference material | README, `replit.md`, `client/requirements.md`, `.claude/...`, `skills-lock.json` | Stale/template material; not authoritative architecture or app runtime |
| External reference | `vjudge-reference` Git entry mode `160000`, pinned commit `553bf140ca2349c21d502099161f192c80a34179` | Empty/uninitialized gitlink; no tracked `.gitmodules`; no implementation or rights inferred from it |

Documentation drift: `replit.md` describes scrypt, an `auth.ts`, a flat `routes.ts`, and a PostgreSQL session store. Current code uses bcrypt, modular routes, `passport.ts`, and the default in-memory session store. Use code evidence over those claims.

## Routes and authorization

Frontend routes in `App.tsx`: `/auth`, `/`, `/dashboard`, `/mentor`, `/sheets`, `/sheets/:id`, `/contests`, `/contests/:id`, and fallback. `/` redirects by role; dashboard is student-only, mentor page mentor-only, sheets and contests allow both. These browser checks are not server authorization.

| Backend endpoints | Actual guard and behavior |
| --- | --- |
| `POST /api/register`, `POST /api/login` | Public; registration manually checks required truthy fields and two role values; login uses Passport Local |
| `POST /api/logout` | Public route; calls Passport logout |
| `GET /api/user` | Auth required, returns full database user |
| `GET /api/stats/dashboard` | Auth + student role; statistics scoped by session user ID |
| `GET /api/sheets` | Auth; list scoped to session user ID |
| `POST /api/sheets` | Auth; create assigns session user ID |
| `GET /api/sheets/:id`, `GET /api/sheets/:id/problems` | Auth; owner **or any mentor**, with no mentor/student assignment check |
| `PUT /api/sheets/:id`, `DELETE /api/sheets/:id` | Auth and current owner check; update body is unrestricted, permitting ownership/identity-field tampering |
| `POST /api/sheets/:id/problems` | Auth and sheet owner check; creation forces route sheet ID |
| `POST /api/sheets/bulk-upload` | Auth; unrestricted in-memory Multer upload, XLSX parsing and multi-step writes |
| `PUT /api/problems/:id`, `DELETE /api/problems/:id` | Auth only; no owner lookup or ownership condition in writes |
| `GET/POST /api/contests` | Auth only; list global/optional type filter; create lacks server-side mentor/club restriction |
| `GET /api/contests/:id`, `GET /api/contests/:id/leaderboard` | Auth only; global contest contents/participants/standings, irrespective of membership |
| `POST /api/contests/:id/join` | Auth only; application-level duplicate check; no lifecycle/membership constraints |
| `POST /api/contests/:id/problems/:problemId/submit` | Auth only; accepts client status; does not verify contest/problem pairing, participation, timing, or actual judge verdict |
| `POST /api/contests/blitz/queue` | Auth only; find/create multiplayer match; fixed problem rather than adaptive selection |

There is an actual sheet-update endpoint missing from the shared route contract/client hooks. There is no Codeforces API proxy, account synchronization, LLM endpoint, durable worker, or weekly scheduler.

## Feature completeness and reuse

| Feature | What exists | Target disposition |
| --- | --- | --- |
| Registration/login/logout | Connected UI → Passport/controller → database service; bcrypt hashing/comparison | Preserve approach and form primitives; replace registration DTO, sanitize responses, harden sessions and test |
| Responsive navigation | Mobile menu, sidebar, toasts, tooltips, loading/empty states | Adapt layout labels/routes; remove role and plan/club/arena copy |
| Sheet/problem CRUD | Connected list/create/delete and status mutation; import workflow | Do not retain sheet product/schema; extract table/dialog/loading and mutation patterns only |
| Problem editing | Add dialog works structurally; Edit menu callback explicitly omitted | Placeholder; do not claim edit support |
| Dashboard | Cards, Recharts activity series, totals/today/streak service | Reuse presentation; replace aggregation semantics and error handling |
| Mentor management | Welcome-only mentor dashboard; no student management service | Placeholder; remove entirely |
| Contest creation/join/standings | Connected persistence, problem links, status selection, leaderboard polling every 5 seconds | Exclude entirely; this is local contest hosting, not Codeforces contest-history analysis |
| Blitz matchmaking | Fixed CF `71/A` link, race-prone matching, returns stale pre-update match | Placeholder selection and incomplete lifecycle; exclude entirely |
| “First to solve” scoring | Every submitted `Solved` increases score; no first-solve rule | UI promise does not match implementation; never reuse |
| Problem verification | Manual status selection only | No judge synchronization, code execution, or independently verified solve evidence |
| CF trainer requirements | None of profile import, rating history, catalog rating bounds, statement provenance, reasoning classification, verification evidence, goals/deadlines, adaptive assignments, thinking timer, assistance tracking, trends or weekly refresh exists | New domain work in later approved phases |

Precise reuse list: `main.tsx`; provider/routing arrangement in `App.tsx`; responsive structure in `components/layout.tsx`; `lib/utils.ts`; selected primitives (button, card, input, label, textarea, dialog, dropdown-menu, table, badge, tabs, skeleton, form, toast/toaster, tooltip and alert-dialog as needed); toast hook; CSS tokens and Tailwind/PostCSS setup; dashboard card/chart markup; React Query fetch/invalidation patterns; Express router/controller/service separation; PostgreSQL connection pattern; Passport Local serialization pattern and bcrypt helpers; shared Zod-contract pattern; Vite/esbuild build structure; MIT license and original copyright notice. “Reuse” is conditional on the repairs below, not wholesale copying of those files unchanged.

## Security and correctness findings

Severity reflects practical impact in the original app. Findings are source-level evidence; no live exploitation was performed.

| ID | Severity | Evidence | Impact and required disposition |
| --- | --- | --- | --- |
| S1 | High | `auth.controller.ts:34,42,54` returns complete users; `schema.ts:11` stores password hash; `index.ts:41–54` logs full JSON responses | Password hashes, email and private profile fields reach browsers and logs. Use explicit public-user DTO and metadata-only logging; never import old logs |
| S2 | High | `sheets.controller.ts:104–118`, `sheet.service.ts:43–62` | Any authenticated user can update/delete another user's problem and its submission history. Every private lookup/write must constrain user ID; add two-account negative tests |
| S3 | High | `auth.controller.ts:6–30`; `sheets.controller.ts:26,80` | Anyone can self-register as mentor and read arbitrary sheets/problems, including notes. Remove roles/mentor bypass, not just mentor UI |
| S4 | High | `sheets.controller.ts:52,108` forwards `req.body`; services spread into `.set()` | Owner can transfer sheet ownership; problem fields/parent sheet and other known schema fields can be changed directly. Parse strict request DTOs, exclude IDs/ownership/timestamps |
| S5 | High before deployment | `passport.ts:9–18` | Literal fallback session secret, default MemoryStore, no explicit secure/SameSite/expiry policy. Require fresh secret; persistent PostgreSQL sessions; explicit cookie/CSRF/proxy policy. Installed express-session source confirms HttpOnly defaults true and MemoryStore is used. Installed Passport 0.7 source confirms session regeneration on login/logout; keep it and test end-to-end invalidation rather than report a missing regeneration defect |
| S6 | High correctness | `contest.service.ts:37–58` | Repeated client `Solved` awards repeated points; unrelated/nonexistent problem ID can supply points/default 100; no contest timing/participation validation. Read-modify-write scores lose concurrent updates. Exclude subsystem |
| S7 | Medium/high | Controllers and shared routes; `sheets.routes.ts:6,13` | No server Zod parsing, bounded strings, strong password/URL/date/status/ID validation or rate limiting. Memory uploads have no file/row size limit. Remove XLSX routes; validate retained APIs and rate-limit auth |
| S8 | Medium/high availability | `index.ts:67–72`; `sheets.controller.ts:15–18` | Error handler sends raw error message then throws; async listSheets rejection is not forwarded in Express 4. Use consistent sanitized errors and async error forwarding |
| S9 | Medium privacy | `use-auth.tsx` changes only user query at logout/login; `queryClient.ts` defaults infinite stale time | User-independent private query keys and retained caches can show previous account data after account changes. Cancel/clear private cache and use user-scoped keys; logout must check HTTP result |
| S10 | Medium integrity | `shared/schema.ts`; sheet/contest multi-write services | ORM relations are not SQL foreign keys; no `.references()` columns, owner indexes, status checks, participant uniqueness, submission deduplication, or transactions. Orphans and partial writes possible |
| S11 | Medium correctness | `sheet.service.ts:46–56`; `stats.service.ts:18–56` | Each `Solved` update appends another solve even for missing/foreign problem; reverting status does not clear solvedAt. Daily counts/progress count repeated submissions; contest submissions with null problemId count as one solved problem; deleted sheets leave submissions. Local-day vs UTC aggregation disagree; no personal timezone |
| S12 | Medium development exposure | `vite.ts` sets `allowedHosts: true`; `index.ts` binds all interfaces | Restrict development to loopback/explicit allowed hosts. Do not run copied app against public interfaces or original credentials |

Positive evidence: queries use Drizzle parameterized expressions rather than interpolated SQL; create-sheet/problem/contest handlers force session/route ownership identifiers in those particular creation paths; bcrypt compares hashes server-side; Passport serializes only user ID. These do not resolve the authorization and response leaks above. No arbitrary server URL fetch or raw-HTML injection was found in active application code; URL inputs still need an HTTPS/Codeforces allowlist for the target.

## Tracked private artifacts and secret handling

- Git working tree was clean at audit start. Repository is not shallow; 5 commits are reachable across local main and origin main refs. No remote was fetched.
- `.env` is tracked at HEAD (162 bytes) and appears in reachable history. Its contents were not read, printed, copied, or loaded. Actual credential validity/type is therefore unconfirmed. Treat any credentials in it as potentially exposed; owner should rotate affected credentials outside this task.
- `dev.db` is tracked, but both HEAD blob and working file are zero bytes. It is not evidence of a usable SQLite database or real data. It was not opened or copied. No other dump/key/certificate/credential-like filenames matched the inspected current/reachable-history filename patterns.
- `.gitignore` contains only `node_modules`; it does not protect `.env`, databases, dumps, logs, or generated builds.
- A redacted pattern scan of 101 current non-lock source/config/document files and eligible source/config blobs in all 5 reachable commits found a literal session-secret fallback in current `server/passport.ts` and historical auth files. No value is reproduced here. Credential-bearing DB URLs, common provider-token patterns and private-key block patterns produced no additional findings in that scanned scope.
- This is not a claim that the repository contains no other secrets: `.env` values, lockfile contents for secret scanning, `.claude` material, unreachable objects/reflogs, external submodule contents and remote-only history were outside the content scan. Environment/dump detection used metadata only.
- Use a new repository with new history. Do not clone Git history into the trainer. History cleanup/credential rotation in the source would require a separate authorized task; this audit did neither.

## Database compatibility

Seven tables: `users`, `sheets`, `problems`, `submissions`, `contests`, `contest_participants`, `contest_problems`. `users` has unique username/email and required club/role fields. Problems belong to a sheet and mix shared metadata with per-user status, notes and solved timestamp. Submissions optionally refer to either sheet problems or hosted-contest problems without an exclusive-target constraint. Contest settings are JSON encoded as text, order is text, and timestamps lack explicit timezone semantics.

All runtime and Drizzle configuration point to PostgreSQL (`pgTable`, PostgreSQL arrays/serial/timestamps, `node-postgres`, dialect `postgresql`). `better-sqlite3` and empty `dev.db` are unused remnants. Switching to SQLite would require schema/driver/query changes and is not the smallest safe reuse strategy.

No migration SQL/snapshot directory is tracked; `db:push` is the only database script. Actual remote schema, server version and existing data are unknown because the original connection was not used. Choose a **fresh independent PostgreSQL database**, code-first reviewed migrations, and synthetic fixtures; no original data migration by default. See `MIGRATION_PLAN.md` for optional future consented import and rollback safeguards.

## Dependencies that can eventually be removed

Do not remove packages solely on a text-search result; confirm the retained dependency graph and build first.

| Group | Candidates and conditions |
| --- | --- |
| Excluded spreadsheet workflow | `xlsx`, `multer`, `@types/multer` after associated controllers/routes/import UI are omitted |
| Unused database/store leftovers | `better-sqlite3`, `memorystore`; `connect-pg-simple` is currently unused but keep/use it for planned persistent PostgreSQL sessions and retain its types |
| No direct app imports found | `@jridgewell/trace-mapping`, `framer-motion`, `react-icons`, `tw-animate-css`, `zod-validation-error`; verify config/build/transitive use before removal |
| Development-specific extras | Replit cartographer/dev-banner/runtime overlay plugins if removed from Vite config; `@tailwindcss/vite` is unused with current Tailwind 3/PostCSS pipeline |
| UI-only dependencies | `next-themes` only imported by unreachable chart wrapper; `cmdk`, `vaul`, `embla-carousel-react`, `input-otp`, `react-resizable-panels`, `react-day-picker` and associated Radix modules if their unused components are not retained |
| WebSocket declarations | `ws`, `@types/ws`, optional `bufferutil` have no application WebSocket feature; assess Vite/dev graph before removal |

Keep `tailwindcss-animate`: `tailwind.config.ts` requires it despite absence of ES imports. Keep `@tailwindcss/typography` while configured. Keep React Query, forms, Zod, Wouter, bcrypt, Passport/session, Express, Drizzle and PostgreSQL. Explicitly declare directly imported `pg`, `@types/pg`, and `nanoid` if the Vite adapter remains: current manifest relies on transitive/peer resolution (lock contains pg 8.16.3, @types/pg 8.11.6, nanoid 3.3.11).

Thirty UI modules are not reachable from the current client entry: accordion, alert, aspect-ratio, avatar, breadcrumb, calendar, carousel, chart, checkbox, collapsible, command, context-menu, drawer, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, separator, sheet, sidebar, slider, switch, toggle-group and toggle. Static reachability is an audit heuristic; future trainer UI may legitimately reuse some. The UI primitive named `sheet` is a drawer component, distinct from the prohibited practice-sheet feature.

## Existing checks and isolated verification

Validation environment: Node 25.3.0, npm 11.6.2, Windows PowerShell. An allowlisted snapshot of 103 tracked application/config/license files was prepared outside the original repository at `G:/CF_Practice_Setup/.phase0-audit-validation`. It excludes `.git`, `.env`, `dev.db`, `.claude`, gitlink contents, and private/generated artifacts. Dependency lifecycle scripts are disabled. No app server, production job, database migration or database-backed test was run.

| Check actually executed | Result | Interpretation |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed, 532 packages installed | Exact original manifest/lockfile; lifecycle scripts disabled. Initial sandbox attempt failed with npm “Exit handler never called”; approved retry succeeded. An earlier ephemeral-temp attempt failed before a usable snapshot/install and was superseded by the stable isolated directory |
| `npm run check` (`tsc`) | Passed, exit 0 | Original sources type-check under the audited runtime; incremental metadata written only in isolated node_modules |
| `npm run build` (`tsx script/build.ts`) | Passed, exit 0 | Vite built 2,761 modules; client JS 939.23 kB (273.25 kB gzip), CSS 72.91 kB; server bundle about 2.3 MB |
| Build warnings | Non-fatal | Browserslist dataset reported 12 months old; client chunk exceeds 500 kB. Consider pruning excluded features and later route splitting before adding packages |
| `npm ls --depth=0` | Passed, exit 0 | Installed direct dependency tree resolves; this does not establish absence of vulnerabilities |
| Test/lint discovery | No test/lint scripts or actual test suite/config found | No automated behavioral tests passed or failed because none exist. Type-check/build are the existing checks; `tsconfig.json` also excludes `**/*.test.ts` |
| Source preservation | Passed | All 103 copied files SHA-256 match original files after checks; original Git status remains clean and diff empty; excluded private artifact paths absent from snapshot |
| Database/runtime/browser tests | Not executed | No independent disposable PostgreSQL instance was provisioned; original credentials/database were deliberately unused. Native module lifecycle setup, real authentication, migrations, production startup and browser workflows remain unverified |

The original application **builds and passes its existing type-check** in the isolated copy. It is not established as functionally correct or secure. The manifest's `dev` and `start` scripts use POSIX `NODE_ENV=...` assignment, which needs a portable adjustment for Windows npm shells. Direct `pg`/types and adapter `nanoid` declarations should be repaired despite transitive resolution succeeding. No vulnerability advisory scan was performed.

The isolated validation directory is temporary audit tooling, not the migrated project; it is removed after verification. Only the audit documents/status remain as deliverables.

## Blockers and external access

1. Security repairs, portable startup scripts and explicit runtime dependency declarations must be resolved in the new project before calling the inherited app a safe working baseline. Type-check/build already pass; do not treat them as failed blockers.
2. Independent PostgreSQL provisioning and an explicit supported Node runtime are required; source `.env` must never be reused. Source database compatibility beyond the PostgreSQL code cannot be established without separately authorized access.
3. Authorized statements are not available in this repository. The documented `Problem` object has metadata (identity, title, rating, tags, etc.) and no statement body. There is no documented statement method in the inspected method list. This is an inference from the official [objects](https://codeforces.com/apiHelp/objects?locale=en) and [methods](https://codeforces.com/apiHelp/methods?locale=en&mobile=true) documentation, not permission to scrape.
4. Before statement ingestion/analysis, establish a user-provided authorized corpus or a source with explicit rights to store/analyze statements; record provenance, permission basis, version/hash, locale and attribution. Missing authorization must leave the analysis queue blocked. A Codeforces link alone does not establish reuse rights.
5. Official [methods documentation](https://codeforces.com/apiHelp/methods?locale=en&mobile=true) supports public profile, rating-history, submission and contest metadata integration. Live endpoint availability/limits and profile-handle ownership are untested. This audit browsed API documentation only; an introduction-page request returned HTTP 403. Do not bypass access controls or assume this proves all API endpoints unavailable.
6. Mathematical verification needs a later approved evidence protocol: independently derived rationale, counterexample/property checks, proof review where relevant, and explicit uncertainty. Passing samples or a model assertion alone cannot mean verified. Recent-style trends must use independently derived labels and show corpus coverage/bias.

## Phase 0 acceptance

Required inventory, reuse/repair decisions, schema strategy, security audit, Git artifact metadata audit, dependency candidates, check outcomes/limitations, architecture proposal and ordered Phase 1 criteria are documented across the three deliverables and status file. Original source and Git state must remain unchanged at final verification. Phase 1 is proposed only and requires approval.
