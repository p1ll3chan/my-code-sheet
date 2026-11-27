# Phase 4B pilot preparation

Status: **proposal only**. No Codeforces statement permission grant, selected real-problem manifest, account model-availability confirmation, model price sheet, paid inference or mathematical pilot result exists. The user authorized mock and appropriately licensed synthetic fixtures only. Bulk Codeforces statement ingestion and paid analysis remain disabled. This document does not authorize changing those settings.

## Proposed problem set

Select **36 distinct rights-cleared problems**, four in each inclusive rating band, after a source grant permits sending statement text to the configured OpenAI API, storing derived analyses, and sharing reviewed results. Record the grant reference and attribution for each immutable statement version. The identifiers below are *slot IDs*, not Codeforces problem IDs; actual problem keys cannot responsibly be shown until the legal source and manifest exist. The final 36-key manifest must be shown for approval before any paid call.

| Rating | Proposed slots and discovery coverage |
| --- | --- |
| 1200 | P1200-A conventional control; B non-obvious invariant; C construction; D misleading-similarity case |
| 1300 | P1300-A characterization; B hidden greedy reduction; C reverse operations; D misleading-similarity case |
| 1400 | P1400-A multi-observation; B invariant; C counting; D conventional control |
| 1500 | P1500-A counting; B characterization; C hidden greedy; D misleading-similarity case |
| 1600 | P1600-A reverse operations; B multi-observation; C construction; D conventional control |
| 1700 | P1700-A construction; B counting; C characterization; D misleading-similarity case |
| 1800 | P1800-A hidden greedy; B reverse operations; C multi-observation; D conventional control |
| 1900 | P1900-A invariant; B construction; C counting; D misleading-similarity case |
| 2000 | P2000-A characterization; B hidden greedy; C multi-observation; D conventional control |

Human selectors must document the decisive difference behind each misleading pair and cover older/recent contest windows. These selectors' reference observations and labels stay outside the analyst input. Phase 4A's [54-problem evaluation benchmark](ANALYSIS_EVALUATION.md) remains the broader evaluation design; this smaller 36-problem set is an initial paid engineering pilot, not a substitute for the held-out benchmark. A source-permitted synthetic fixture may exercise the pipeline but does not count as a real Codeforces pilot problem.

## Cost estimate to finalize before authorization

The proposal uses one primary, one blind derivation and one critique per problem, with **at most 6,000 output tokens per call**. Ratings 1200–1700 use the standard model for the primary call; ratings 1800–2000 use the strong model. Blind derivation and critique use the strong model. For 36 problems this is **24 standard calls and 84 strong calls**, assuming every candidate reaches both verification calls. A planning assumption of 5,000 input tokens for each primary/blind call and 12,000 for each critique gives:

`estimated USD = 0.120 × standard_input_price_per_M + 0.144 × standard_output_price_per_M + 0.672 × strong_input_price_per_M + 0.504 × strong_output_price_per_M`

This is a **formula, not a dollar quote**. Actual statements and candidate lengths may change input usage, output may reach the cap, and retries/failed calls may cost money. Before approval, confirm the exact account's availability and current prices for `gpt-6.1-sol` and `gpt-6-astra`, measure authorized input lengths, compute a dollar estimate plus a conservative retry reserve, show the exact 36 keys and grants, and set a positive hard cumulative `AI_SPEND_LIMIT_USD`. The application's reservation ledger holds a conservative per-call amount under a database lock and never automatically replays an ambiguous paid call. It does not establish that a provider bill will equal its estimate.

## Pilot gates and review

1. Obtain and document the actual statement processing/storage/sharing grant; do not treat Codeforces API metadata as statement permission. Confirm every selected key is currently rated 1200–2000.
2. Confirm both requested IDs with the configured account's model endpoint, validate Responses structured-output support for the exact models, and pin model/prompt/contract versions and prices. Do not infer account access from a model name.
3. Freeze the 36-key manifest, source hashes, legal scope, per-call token assumptions, projected cost, total cap and paid approval reference. Ask the user to approve this concrete plan before enabling live mode.
4. Run one authorized problem first and inspect schema parsing, sample evidence, critique, usage and failure behavior. Stop if the result is blocked/disputed or cost differs materially. Resume only within the approved scope.
5. Human reviewers evaluate correctness, proof obligations and predicted student bottlenecks using the Phase 4A rubric. Sample passes and model agreement are not proof. Only named, evidence-backed proof review can publish a record.

No pilot is currently ready to run: permissions, actual IDs, account model access and prices remain unresolved.
