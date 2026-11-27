# TODOS

Deferred by /plan-ceo-review on 2026-11-28 (SCOPE REDUCTION). Each item needs its own phase review before it is built. The source design is `~/.gstack/projects/p1ll3chan-my-code-sheet/p1ll3chan-main-design-20261128-000656.md`.

## Phase 5A: Reasoning-aware recommender (CEO-3)

Build after Phase 5A-0 has produced at least 10 real `test-verified` fingerprints.

- **Skill model.** One row per user per dimension, holding value, evidence count and uncertainty. Dimensions are discovery, extension, proof, implementation, timed, hint dependence and transfer. Dimensions derived from the timer work from day one. Concept dimensions read `test-verified` fingerprints, and weight `training-ready` ones higher.
- **Six policies** from `Prompt.pdf`, as transparent scoring functions over `knowledge.search()`. When the `test-verified` pool is empty they fall back to `server/training/planner.ts`, and each card is labeled with which mode produced it.
- **Explanations** use only data from the user's side plus `SafeProblem` fields: policy name, the dimension it targets, the user's own evidence, rating relative to the band, and planned minutes. No reasoning field from the problem may reach a card before the attempt.
- **Evaluation** against the current planner: every card records its policy version and a baseline counterfactual.

## Phase 5B: Progressive Socratic coach (CEO-4)

Follow `Prompt.pdf` 5B, with these changes:
- The coach reads `test-verified` analyses, labeled machine-verified.
- It may show a full proof only from `proof-reviewed` analyses.
- Decide whether `reviewProof` may accept processing-allowed, non-shareable (`licensed-dataset`) statements. Today it requires `sharingAllowed` (`server/reasoning/service.ts:289`), so dataset analyses can't reach `proof-reviewed` (CEO-12).

## Phase 5C: Source-code analysis (CEO-4)

Follow `Prompt.pdf` 5C. Code comes only from the user, pasted or uploaded, because the Codeforces API returns no source. The Phase 5A-R `bwrap` runner can be reused for isolated execution.

## Phase 6: Weekly sync and trends (CEO-4)

Follow `Prompt.pdf` 6, with these changes:
- Trend statistics show coverage and sample size, and are hidden below a minimum sample. That minimum is decided in the Phase 6 review.
- Problems from contests after the dataset ends (early 2025) are queued but marked statement-unavailable until a source is decided.

## Phase 7: Gamification, deadlines, forecasts (CEO-4)

Follow `Prompt.pdf` 7. It is deterministic and needs no AI.

## Phase 8: Release review (CEO-4)

Follow `Prompt.pdf` 8.

## Repo: GitHub push credentials on the Linux machine (eng review D10, P2)

- **What:** set up push access to `p1ll3chan/my-code-sheet` on this machine, with an SSH key or an HTTPS token.
- **Why:** `git fetch` over SSH fails with "Permission denied (publickey)". Until this is fixed, the restructured repo exists only locally.
- **Pros:** gives the work a remote backup and lets the restructure reach GitHub.
- **Cons:** you have to create or authorize a GitHub credential yourself.
- **Context:** the nested clone uses HTTPS. Confirm the remote tip first with `git ls-remote https://github.com/p1ll3chan/my-code-sheet.git main`. No push is approved by any review.
- **Depends on:** the D5 sync and the restructure commit.

## UI: align Settings, Progress and Auth with DESIGN.md (design review D10, P3)

- **What:** remove the card stacks and use utility headings and the DESIGN.md tokens on `pages/training-settings.tsx`, `pages/progress-history.tsx` and `pages/auth-page.tsx`.
- **Why:** the design review (2026-11-28) went deep only on the practice loop. These screens keep the stacked-card pattern the dashboard is dropping (D6).
- **Pros:** the app looks like one product, with less template feel.
- **Cons:** about 1 day of human work (CC about 30 min) once DESIGN.md exists.
- **Context:** the approved design decisions D2-D9 are in the design-review log. Follow the same app UI rules: cards only when the card is the interaction.
- **Depends on:** `/design-consultation` producing DESIGN.md (D7).
