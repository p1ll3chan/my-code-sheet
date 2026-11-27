# Historical backfill operations

Implemented Phase 4 infrastructure, 2026-10-16. No production backfill or paid inference has been launched. Current real catalog: 4,453 eligible problems, all awaiting authorized statements. Existing local catalog/evaluation data is preserved.

## Default and operator boundary

The CLI defaults to `plan`, mock provider and dry-run. A plan reads the catalog and does not enqueue jobs, retrieve statements or call a model. Source registration, review and batch mutations are local operator functions, not public HTTP endpoints. Application read routes still require authentication.

Keep `AI_ENABLED=false`, `AI_DRY_RUN=true`, `AI_PROVIDER=mock`, `AI_BACKFILL_ENABLED=false` and zero spending unless a specific real pilot/batch has been approved. A named environment flag or approval file does not obtain statement rights or human approval by itself.

## Database and catalog

```powershell
npm run db:local
npm run db:migrate
npm run catalog:sync -- --status
npm run catalog:sync -- --if-stale
npm run reasoning:plan -- --limit 50
npm run reasoning:backfill -- plan
```

`db:local` is the foreground managed database helper; run application/CLI commands in another terminal. Metadata synchronization uses the official Codeforces API through the existing shared request gate, retry/cache layer and idempotent catalog upserts. `--if-stale` observes the seven-day cache. `--sync` explicitly refreshes metadata. No command above scrapes statements or fetches submissions' private source code. A failed refresh retains the prior successful catalog and shows a stale/error state.

Migration `0006_salty_lizard.sql` adds batch tables, nullable job batch/checkpoint fields and reviewed concept weights/indexes. It contains no DROP, DELETE or destructive data conversion. Seven migrations have been applied and reapplied to the identity-checked local database. Never reset the database to recover a failed analysis.

## Authorized statements

Register a reviewed statement JSON using `npm run reasoning -- register <approved-statement.json>`. The exact strict input is `statementRegistrationSchema` in `server/reasoning/statement.ts`: stable problem key; statement, constraints, I/O and examples; source/grant/attribution/approval time; processing/sharing declarations; scope/owner; and output comparison policy. Keep intake files in a private ignored location. Do not put credentials, editorial content, tags or published solutions in the statement payload.

Only shared, current, nonrevoked, processing-allowed and sharing-allowed statements can enter a global job. Live jobs require `operator-approved` real sources; synthetic sources are test/mock inputs. A source registration cannot prove permission. The operator must establish the right to store the statement, transmit it to the configured provider and share derived records. No explicit Codeforces grant has been obtained yet.

## Planning and bounded execution

Optional selection JSON:

```json
{ "limit": 50, "identities": [], "revision": "initial" }
```

```powershell
npm run reasoning:backfill -- plan .local/selection.json
npm run reasoning:backfill -- create .local/selection.json
npm run reasoning:backfill -- run <batch-id>
npm run reasoning:backfill -- status <batch-id>
```

`create` is explicit persistence, not inference. It fails for an empty eligible/authorized plan. `run` executes at most `AI_BATCH_SIZE` jobs (1–50, default 1), then returns with the batch paused, completed or blocked. Reinvoke the same batch ID to resume; there is no background loop or automatic continuation into another paid batch. A global advisory lock enforces one concurrent backfill runner. Generic `reasoning run` does not drain batch-owned jobs.

Plans freeze statement IDs/hashes, selected keys/ratings/model tiers, prompt/configuration fingerprint and selection/revision. Identical plans deduplicate into one durable batch. Each job has its own unique analysis key and attempt limit; batches referencing a job owned elsewhere skip it instead of double-charging. Run-time checks revalidate source currency and eligibility. A newly reviewed unchanged analysis is skipped. Frozen configuration mismatch refuses execution.

Planning inspects the whole current eligible catalog; the `items` page is bounded to 1–500 keys. Use returned `nextAfter` as the next selection's `after` field after reviewing/finishing the current approved page. Missing sources remain explicit and must be revisited after permissions/registration improve. Stable lexicographic keys are cursors, not chronological order. Catalog membership may change between plans; each plan is its own snapshot.

The plan reports missing statements, already proof-reviewed records, existing jobs requiring review or explicit revision, proposed items, four-call estimate and output-token ceiling. Input/cost estimates use a disclosed scenario (statement bytes/4, 6,000 schema/prompt tokens per call, maximum output and carried solutions). They are **not** measured token counts or guaranteed cost bounds. Prices default to unavailable; mock cost is zero. Actual spending protection uses conservative per-call byte/output reservations. There is no assumed offline discount or real-corpus throughput forecast.

## Paid batch gate

Before a paid batch, establish and record all of:

1. Suitable statement rights and a concrete real problem set.
2. Successful approved mathematical pilot/quality review and human-review capacity.
3. Actual configured-account model availability and Responses/schema compatibility. Requested model names in old handoffs are preferences, not verified API access.
4. Current pricing, model routing, token/cost estimate and explicit approval of this finite batch and budget.

Then configure the server-only AI credentials/models/prices, `AI_ENABLED=true`, `AI_DRY_RUN=false`, `AI_PROVIDER=openai`, `AI_BACKFILL_ENABLED=true`, positive `AI_SPEND_LIMIT_USD`, exact `AI_APPROVED_PROBLEM_KEYS` and `AI_PAID_APPROVAL_ID`. Planning is still read-only.

The approval JSON accepted by `create <selection.json> <approval.json>` contains exactly:

- `planHash`: the hash returned by the current live plan.
- `approvalId`: matching `AI_PAID_APPROVAL_ID`.
- `pilotApprovalRef`: the approved pilot/quality review reference.
- `expiresAt`: future ISO datetime.
- `maxSpendUsd`: positive batch ceiling, no larger than the configured global ceiling.
- `pricingCheckedAt`: an actual pricing check within the last seven days, not in the future.
- `pricingSource`: URL of the checked source.
- `modelCompatibilityConfirmed: true` and `statementRightsReviewed: true`: operator attestations backed by reviewable evidence.

These attestations are not automatically authenticated approvals or legal conclusions; only authorized operators may supply them. Execution rechecks the approval, expiry, pricing age and frozen configuration. Each model call preflights model availability. It reserves cost under the same database advisory lock as the evaluation runner, counts unresolved calls at their reserved amount, and checks both global and per-batch budgets. A reservation that exceeds either cap sends no request. Unknown usage or an actual charge above its reservation blocks further processing of that job for reconciliation.

There is no authorization to run those paid commands in the current phase. A new paid scope requires explicit user approval; this implementation does not imply that approval.

## Resume, recovery and monitoring

Jobs persist the mathematical derivation before classification and the combined candidate before critique. Mock retry limits/backoff and leases are bounded. A process restart can reuse the derivation/candidate and complete remaining stages. Completed jobs are not automatically reprocessed.

An interrupted live request can have charged even if no response was saved. Live jobs with a prior nonfailed usage record block automatic replay. Inspect the usage ledger/provider billing and preserved artifacts before any separately approved replacement. Do not erase reservations, relabel usage as free, reset attempts or expand budgets to bypass the gate. There is no automatic paid reconciliation tool; a reviewed operational procedure remains necessary.

For a failed/untrusted record, an operator can create a new explicit selection with `identities`, a new `revision`, a meaningful `reason` and optional `tier: "strong"`. This creates a separately traceable job; old results stay intact. Unchanged proof-reviewed records are still skipped. Already completed but unreviewed candidates ordinarily need review, not more inference. A changed statement is a new source version. Prompt/model changes require a new reviewed plan. Selective strong routing is available; evaluation evidence, not the model name, must justify paying for it.

`status` reports item counts, persisted job outcomes, actual-or-reserved micro-USD, unresolved calls and measured completed-items/minute over recorded runner time. This is operational throughput, not verified-problems/minute, and a crashed interval may be missing from timing. A batch marked completed can contain failed/skipped items; inspect the counts. Coverage remains separate from job completion.

Use authenticated `GET /api/reasoning/coverage` and `/knowledge-coverage` for current real coverage by exact rating band. Exclusive states sum to the eligible denominator; generated/version/evidence counts overlap and must not be added to that sum. Synthetic/mock results never inflate real mathematical coverage. Historical versions are audit history, not newly verified problems.

## Execution/verification limitations

`AnalysisExecutionBackend` defines an asynchronous-compatible submit/poll contract, and an inline adapter is implemented. **The orchestrator currently uses only inline execution. No OpenAI Batch upload, polling, discounted pricing, cancellation or reconciliation implementation exists.** Do not swap in an asynchronous implementation without adding durable provider-ticket recovery and its own acceptance tests.

Catalog verification can execute reviewed problem-specific harnesses with the bounded integer VM in `verification.ts`; it cannot run arbitrary generated C++/Python/JavaScript. The evaluation framework already supplies sample, edge and seeded differential suites for original fixtures. Real problems with unsupported I/O or algorithms need a reviewed harness or a future genuinely isolated execution backend. Unsupported tests are not passes. Human proof/educational review remains required and is not performed by the batch runner.

## Development checks

```powershell
npm run check
npx tsx --test --test-concurrency=1 tests/reasoning-knowledge.test.ts tests/reasoning-pipeline.test.ts tests/reasoning-coverage.test.ts
npm test
npm run verify:files
```

Tests use disposable databases, original fixtures and fake providers, including live-shaped budget tests with zero network traffic. The real development database currently has zero analysis batches, real statements and live calls. Do not treat fixture review attestations as actual human mathematical evaluation.
