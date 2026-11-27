# Phase 4B-R2 — Mathematical quality evaluation

The evaluation framework is implemented. **No real model quality has been measured and no Codeforces mathematical knowledge has been verified by this phase.** No paid inference, statement ingestion or Phase 4C work occurred.

## Readiness checked directly

The identity-checked local PostgreSQL database was started without resetting it. Before this change, the existing five migrations reapplied successfully. The real coverage service returned 11,457 catalog entries, 4,453 eligible entries, 305 unrated entries, zero authorized real statements and zero analyses; all eligible entries were awaiting statements. The coverage endpoint and its partition, authentication and synthetic exclusion tests were inspected and executed. Migration `0005_mathematical_evaluation` adds four tables, foreign keys, checks and unique indexes; no existing data is deleted or rewritten. The application still uses React/Vite/Express/Drizzle/PostgreSQL.

## Implemented path

`server/reasoning/evaluation/` uses the existing `ModelAdapter` and Responses transport, strict Zod validation, database identity/migrations and operator CLI pattern. The established catalog worker and public APIs remain available. The new staged prompt protocol is an evaluation experiment; existing catalog analysis versions are not silently rewritten using it.

1. Freeze the benchmark manifest, input hashes, oracle hashes, seed, selected arms, configured model IDs, output limits, prompt/schema hashes and pricing in a plan. Changing these inputs requires a new run. Repeated creation of the same plan and approval reuses the same run; each run/problem/arm and stage/attempt has a unique database key.
2. Stage A receives only statement, constraints, input/output specification and examples. No fixture ID, stratum, reference, classification, CF tag or prior solution is sent. The response is an algorithm, mathematical discovery, observation DAG, proof, complexity, edge cases, uncertainty and optional bounded program. Recognition is disclosed. No private reasoning traces are requested.
3. Persist and freeze A before Stage B. B sees that solution and the controlled taxonomy, proposes mappings and a concrete student bottleneck, and cannot alter A. Unknown concepts go into a separate proposal list and block acceptance. Mapping IDs and observation references are checked; plausible-looking text still requires review.
4. Execute the supplied bounded program on samples, named boundary inputs and 64 seeded small inputs against a separately specified oracle. Evidence includes exact program/oracle hashes, runner version, domain, seed, cases and first mismatch. An absent program is unsupported. A resource/runtime failure is inconclusive, not proof of a false theorem. A numeric mismatch is a failed test.
5. The critique arm derives a fresh blind solution from the statement alone before receiving the frozen primary, classification and execution evidence. Model support never sets a proof-reviewed flag.
6. Export blind review packets, import immutable reviews, and calculate separate metrics. Nothing in evaluation tables enters catalog coverage or training recommendations.

The instruction interpreter handles only integers and bounded arrays. It has 64 registers, at most 256 instructions, 1,024 array entries, 50,000 steps and safe-integer arithmetic. It cannot invoke JavaScript, subprocesses, files, network or application objects. It is a deliberately limited fixture execution format, **not a general C++/Python sandbox**. The current benchmark input format is a JSON integer array and output is an integer. Supporting real contest formats or languages requires a separately reviewed harness and permitted benchmark manifest.

## Persistence, recovery and limits

- `math_evaluation_runs`: immutable plan/manifest, mode and lifecycle.
- `math_evaluation_cases`: one fixture/arm outcome with frozen result hash, retained selective baseline and failures.
- `math_evaluation_calls`: stage attempts, requested/returned model, prompt/input/output hashes, provider response ID, usage, latency and reserved/actual costs. Invalid outputs remain reviewable; oversized bodies retain their hash only.
- `math_evaluation_reviews`: named, immutable, artifact-bound assessments/audits with all eight rubric judgments and failures.

An advisory lock prevents concurrent workers on the same run. Completed stage outputs survive interruption and are reused. Mock retries stop at the configured limit. A live interruption, ambiguous provider failure, invalid response or spending stop blocks that run for operator reconciliation; it is not automatically replayed. Each invocation processes at most 50 cases and defaults to `AI_BATCH_SIZE` (1). There is no background continuation.

Reservations share an advisory lock and combined spending ledger with the existing analysis worker. The configured global ceiling and the approved evaluation-run ceiling both apply. Unknown usage retains the reservation. Reported costs are computed from actual returned tokens and the frozen operator-confirmed rates, not asserted invoice totals; provider adjustments may need reconciliation. Missing costs remain null. Approval expiration is checked before every paid call. The API transport has configured request timeouts and no tools.

## Commands

Run from the project directory with the local database available:

```text
npm run db:migrate
npm run reasoning:evaluate -- manifest
npm run reasoning:evaluate -- plan
npm run reasoning:evaluate -- create-mock
npm run reasoning:evaluate -- run-mock <run-id> 50
npm run reasoning:evaluate -- export <run-id> .local/report.json
npm run reasoning:evaluate -- export <run-id> .local/blind-review.json blind
npm run reasoning:evaluate -- review <case-id> .local/review.json
```

Repeat a bounded run command only while its reported state is queued. Export refuses to overwrite files. Keep potentially sensitive future analysis/review exports in `.local/`. Optional selection JSON contains exactly `fixtureIds`, `arms`, and `seed`; arm values are `standard`, `strong`, `standard-critique`, `selective`. A one-case selection is useful for debugging. The mock command always uses mock adapters, regardless of live environment flags.

The future live CLI is `create-live <options.json> <approval.json>` then bounded `run-live <run-id> [limit]`. These are documented interfaces, **not authorization to execute them**. Approval must match the exact plan hash, configured approval ID and allowlist, with named approver, dates, reviewed rights, confirmed structured-output compatibility, pricing source/date, maximum cases and spend. Actual account model availability is checked before execution. See `PILOT_COST_ESTIMATE.md` for the unsatisfied prerequisites. The present executable manifest contains only original fixtures; no real CF statement loader is enabled in this evaluation CLI.

## Metrics and interpretation

Reports separate algorithm correctness, proof validity, primary-insight accuracy, reasoning classification and training usefulness. Each shows passes, failures, unresolved cases, unreviewed cases and both total/adjudicated denominators. Two independent assessment reviews are required for consensus; disagreements remain unresolved. Numeric fractions with no adjudicated evidence are null, not 100%.

Verification precision uses **additional independent audits of initially accepted assessments**, not the same reviewers who established acceptance. No audits means no precision estimate. Audit objections suspend acceptance. Costs per accepted result are null when none is accepted or any relevant usage is unknown. Selective escalation reports paired reviewed results against the standard arm, retained pre-escalation evidence, improvements, regressions and incremental cost; no paired reviews means no evidence of benefit. Latency, failed calls and retries are reported independently.

Wilson intervals are descriptive only. Forty-five correlated original variants do not justify corpus-level error estimates. Difficulty and student bottleneck explanations are hypotheses until human review and later learner evidence support them.

## Executed mock benchmark

Local run `ed98eb09-ffc2-4d1a-a663-baac94338336` completed 180 cases (45 fixtures × four arms) in batches of 50, 50, 50 and 30. It persisted **618 mock adapter calls, zero API tokens, $0 cost and zero human reviews**. Three packet-removal fixtures have authored mock implementations; each passes samples, boundary tests and 64 differential cases in each arm. The other 42 fixtures intentionally return uncertainty and unsupported execution. Thus each arm has 45 schema-valid responses, **3 bounded-test passes and 0 accepted/proof-reviewed results**. This is infrastructure evidence, not a mathematical pilot success.

Exports are `.local/quality-evaluation-report.json` and `.local/quality-review-blind.json`. Earlier partial development runs remain as historical records and are not included in these results. Run completion means orchestration finished; it never means every problem was solved.

## Known limitations and next decision

Real CF permissions, real problem selection, qualified human references/reviews, actual account model availability, current prices and paid approval remain missing. The original fixtures are related families with uncalibrated difficulty, and their reference notes/oracles are authored aids awaiting independent review. Most oracle implementations enumerate the original finite search space; equal-pile transport uses a direct conservation/lower-bound reference, so its evidence is a reference comparison rather than an independently exhaustive search. Program/prose equivalence and asymptotic complexity require human judgment. There is no general language runner, measured student-difficulty calibration, full-corpus controller or automatic promotion bridge. These limitations prevent Phase 4C approval.

The provider extension supplies per-stage schemas through the documented Responses `text.format` interface; existing default schemas are preserved. Reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), checked 2026-10-15. Documentation does not confirm availability of any model in this project's account.
