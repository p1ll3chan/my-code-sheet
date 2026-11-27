# Pilot cost and approval readiness

**Paid pilot not approved or started. Current expenditure: $0.** No dollar quote can be honestly supplied yet: the local evaluation plan has no configured model IDs, confirmed prices or positive spending limit. The previously requested standard `gpt-6.1-sol` and strong `gpt-6-astra` remain preferences, not evidence of API account availability or structured-output compatibility. No key was read into an output or sent to a provider during this phase.

## Reproducible estimate

`npm run reasoning:evaluate -- plan [options.json]` produces the exact fixture IDs, model/pricing configuration, prompt/schema hashes, input assumptions and approval hash without inference. For the current 45-fixture manifest and four arms, seed 1729:

| Measure | Planning value |
| --- | ---: |
| Statement JSON bytes across 45 fixtures | 18,516 |
| Approximate standalone statement tokens (bytes/4) | 4,629 |
| Standard calls, including classification | 270 |
| Strong calls, assuming every selective case escalates | 360 |
| Calls before retry contingency | 630 |
| Calls with configured two-attempt contingency | 1,260 |
| Standard input/output tokens, working scenario | 692,460 / 486,000 |
| Strong input/output tokens, working scenario | 1,242,282 / 648,000 |
| Configured maximum output tokens per call | 6,000 |
| Maximum output-token contingency | 7,560,000 |

The working scenario assumes 1,800 output tokens per stage, includes statement/prompt/schema bytes divided by four, 500 envelope tokens per call, previous frozen outputs in classification/critique and 1,000 evidence tokens in critique. It is **not an exact tokenizer estimate or measured live usage**. Model reasoning tokens/output length and serialization can differ. There is no assumed cache, Batch or offline discount. Confirm prices and account capability before using any discount. Human reviewer time and compute/operator costs are separate; no paid verifier service is installed.

For per-million-token rates `S_in`, `S_out`, `T_in`, `T_out` in dollars, the working-scenario inference cost is:

```text
0.692460*S_in + 0.486000*S_out + 1.242282*T_in + 0.648000*T_out dollars
```

Double that scenario for the two-attempt contingency. This is not permission for automatic live retries: ambiguous or invalid live calls block for reconciliation. Standard-only and strong-only selections can be planned separately using the same command; the plan recalculates selected arms and IDs. The standard-critique arm adds a fresh strong blind derivation plus critique. Selective escalation preserves its baseline and adds one strong solve/classification pair plus blind/critique, at most once.

The separate conservative reservation envelope uses UTF-8 request bytes plus schema/envelope allowance and maximum output tokens. Its worst-case planning bound is deliberately much larger (509,150,880 input units across all attempts); **do not interpret this as expected usage**. Before every call the runner reserves using the actual serialized request, rejects any input beyond the planning bound, and applies both run and shared global caps. It records returned usage and frozen-rate cost, keeps unknown costs reserved and blocks further work after an ambiguous failure. A low budget may therefore stop even when expected average cost seems affordable.

## Prerequisites and exact approval

The current benchmark is entirely original project fixtures. A paid **original-fixture** pilot is technically supported after model, pricing, review and budget approval; it will not establish CF quality. A **real Codeforces** pilot additionally needs statement-processing/storage/sharing permission, exact eligible CF IDs and a versioned permitted manifest/harness adapter. None is currently available. The current CLI cannot ingest real CF statements or accept arbitrary problem IDs.

Before any paid run, present the final plan and obtain explicit user approval. Required fields of the separate approval JSON are:

- `planHash`: hash of the exact selected manifest, arms, seed, prompts/schemas, models, prices and limits.
- `approvalId`, `approvedBy`, `approvedAt`, `expiresAt`: concrete scope attribution, matching `AI_PAID_APPROVAL_ID`.
- `statementAuthorizationReviewed: true`, `modelStructuredOutputsConfirmed: true`: operator attestations backed by documented evidence, not substitutes for it.
- `pricingSource`, `pricingCheckedAt`: verified current pricing; checks older than seven days fail closed.
- `maxSpendMicroUsd`, `maxCases`: explicit positive maximum expenditure and case count; expenditure cannot exceed `AI_SPEND_LIMIT_USD`.

Every selected ID must be in `AI_APPROVED_PROBLEM_KEYS`. Server-only key, `AI_ENABLED=true`, `AI_DRY_RUN=false`, `AI_PROVIDER=openai`, both actual model IDs and positive rates are also required. The worker checks both model IDs through the configured account before inference. Model-list availability alone does not prove structured-output compatibility; that evidence is an additional approval prerequisite. Defaults remain disabled/mock/dry-run with a zero ceiling. No approval file or fabricated pricing has been created.

The real-world model comparison and dollar budget remain **blocked pending these inputs**, as required by the user's phase instructions. No Phase 4C batch or offline processing job has been submitted.
