# Pilot evaluation design

Phase 4A proposal, 2026-10-15. **No real Codeforces statements have been acquired, no pilot IDs selected, and no model runs or mathematical validations performed.** This is a reviewable sampling and scoring protocol. Actual selection requires documented statement access; execution requires explicit inference/budget approval. Published rating is a sampling stratum, not ground truth for discovery difficulty.

## Pilot size and coverage

Propose **54 unique problems: six at each of 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900 and 2000**. At every band, select one conventional algorithmic control, two endpoints of a misleading-similarity pair, and three rotating mechanism cases. Each contrast pair has the same apparent algorithm/story but a materially different decisive condition. Assign each problem one primary coverage role for counting; secondary coverage can overlap.

| Band | Slot 1 | Slots 2–3 | Slots 4, 5, 6 |
| --- | --- | --- | --- |
| 1200 | Conventional control | Misleading pair | Invariant; construction; counting |
| 1300 | Conventional control | Misleading pair | Characterization; hidden greedy; reverse operations |
| 1400 | Conventional control | Misleading pair | Multiple observations; invariant; construction |
| 1500 | Conventional control | Misleading pair | Counting; characterization; hidden greedy |
| 1600 | Conventional control | Misleading pair | Reverse operations; multiple observations; invariant |
| 1700 | Conventional control | Misleading pair | Construction; counting; characterization |
| 1800 | Conventional control | Misleading pair | Hidden greedy; reverse operations; multiple observations |
| 1900 | Conventional control | Misleading pair | Invariant; construction; counting |
| 2000 | Conventional control | Misleading pair | Characterization; hidden greedy; multiple observations |

This gives nine controls, nine misleading pairs, four each of invariants/construction/counting/characterization/hidden greedy/multiple observations, and three reverse-operation cases. “Invariant” slots must include genuinely non-obvious invariants, not just a parity keyword. Hidden greedy slots require a derived exchange/dominance/bound argument. For each misleading pair, document the superficially shared algorithm/story **and the different tempting wrong turns or resolving observations**. Add at least six cross-problem positive-transfer links among these 54, including different-looking problems with equivalent discoveries; these are pair annotations, not extra problem counts.

Use metadata to sample rating/contest windows, then independent human solution review to establish category eligibility without feeding tags/editorials into any analysis. Spread contest dates, avoid near-duplicates/translated duplicates, include recent and older problem styles and document selection bias. If a mechanism/rating cell cannot be sourced with permission, report it as an unfilled cell; do not invent a problem ID or silently substitute a different category. A small rights-cleared human-authored synthetic set can test harness behavior but does not count toward the 54 real-problem target.

Registry proposal: `slotId`, canonical problem key, rating and snapshot date, contest date, statement version/hash, authorization evidence/scope, coverage role, pair/family ID, split, reviewer IDs and selection rationale. Fields are null/pending until acquired and reviewed. Keep human category labels, reference proofs and pair annotations outside analyst-visible storage. No editorial text is required to create references; two qualified reviewers derive and adjudicate solutions from the authorized statements.

## Development and held-out split

At each band allocate three problems to development and three to sealed evaluation, giving 27/27. Keep each misleading pair together: odd-numbered band rows assign the pair to evaluation, even-numbered rows assign it to development. Fill each side with the control/mechanism cases using a preregistered assignment that balances categories across splits. Before finalizing, group near-duplicate/discovery-equivalent families, including positive-transfer links, and keep each family wholly within one split. If a split constraint conflicts with coverage, reselect candidates rather than leak a family; log the selection decision.

Reference reviewers create their independent solutions before seeing model candidates. Freeze problem manifests, reference evidence, scoring rubric, model/settings, prompt/contract/taxonomy versions and cost budget before the sealed run. The analysis receives neither rating nor any reference label. Blind graders to model identity and compare outputs in randomized order. Any prompt adjustment after seeing sealed failures requires a new evaluation set or an explicit designation that the old set is now development data.

Record recognition/possible memorization disclosures and recent-versus-older performance separately. Pretraining contamination is unknowable from a correct answer alone. A synthetic reformulation with proven preserved semantics may probe transfer but is not proof of independence and must not be counted as another independent real problem. No claims of perfect novelty or independence are allowed.

## Human review rubric

Two reviewers independently score each candidate; disagreements on essential mathematics go to a third adjudicator. Reviewers write their own judgment before discussion. Retain original scores and rationale; adjudication is not a majority-confidence vote. An unproven essential claim blocks correctness acceptance regardless of the total score.

Use a 0–3 rubric: 0 absent/false; 1 vague, unsupported or substantially incomplete; 2 precise and mostly useful but needs a stated repair; 3 precise, supported and sufficient for the intended purpose.

| Dimension | Evidence for score 3 |
| --- | --- |
| Discovery specificity | Identifies the actual decisive proposition, scope and consequence; not just algorithm names |
| Formulation/naive approaches | Explains the real obstacle and valid counterexamples or bounds for failed methods |
| Student bottleneck | Gives a plausible tempting move tied to the statement, a valid failure witness, a question usable before the solution, and the exact resolving observation; explicitly treats this as predicted behavior |
| Observation chain | Essential steps and dependencies sufficient to derive the algorithm, no hidden leap |
| Conditions/transformations | Correct domains and logical directions; necessity and sufficiency distinguished |
| Proof | All essential obligations, boundary cases, termination and optimality/feasibility justified |
| Algorithm/complexity | Implementable procedure derived from observations, correct bounds and numeric assumptions |
| Taxonomy mapping | Facets separated, existing concepts used consistently, additions justified |
| Transfer/similarity | Correct observation correspondence; misleading pair differences explicitly identified |
| Difficulty/prerequisites | Three separately justified axes relative to learner prerequisites; not copied from rating |
| Hints/training purpose | Correct, progressive, actionable hints targeting specific observations without premature spoilers |
| Uncertainty/honesty | Unsupported/unknown content marked explicitly; no fabricated execution or verification |

Record per-claim error type: false assertion, unstated assumption, invalid implication, circular proof, missing case, faulty algorithm, wrong complexity, inadequate test oracle, or unsupported pedagogical claim. A test-passing wrong proof remains a wrong proof. Compare core discoveries semantically; an alternate correct solution is valid even when it differs from the reference.

Apply a **tag-removal review** to every complete candidate: hide the algorithmic-technique and primary-discovery labels. A reviewer must still be able to explain the tempting mistake, why it fails, what the student should ask next and which mathematical observation unlocks progress. Score the bottleneck dimension **0** if it consists of category names or “think of X”; score **1** if it offers a plausible story without a legal failure witness or linked pivot. Two reviewers independently judge the failure witness and whether the question would help *before* revealing the solution. An unsupported learner stereotype is not evidence. Compare predicted bottlenecks with consented real training-session observations only in a later study; the present pilot scores plausibility and correctness, not measured student behavior.

## Metrics and proposed review gates

Report numerators/denominators, missing cells, band and mechanism breakdowns. With only six problems per band, avoid strong population conclusions. Never hide abstentions/timeouts by removing them from the all-problem denominator. Also report quality conditional on a substantive answer.

- Mathematical acceptance: fraction with all essential obligations accepted by adjudication, plus bounded execution pass rates and coverage separately.
- Discovery quality: rubric distributions; “algorithm-only” failure rate; missing essential-observation rate.
- Bottleneck quality: tag-removal pass rate; valid failure-witness rate; diagnostic-question usefulness; pivot-link validity; count of claimed real-student behavior without evidence.
- Reliability: schema validity, blocked/partial/unsupported rates, critique-detected error rate, repeated-run disagreement on a preregistered small subset and provider/cost/latency data when available.
- Taxonomy consistency: exact primary-ID agreement, per-facet set agreement and adjudication count; proposed-new-concept and redundant-alias rates. Use chance-adjusted agreement only with sufficient label counts, and disclose sparse categories.
- Similarity: false-positive transfer claims on all nine misleading pairs; positive-transfer recall on the six or more reviewed positive pairs. No uncalibrated vector score is treated as ground truth.
- Verification integrity: count unsupported claims incorrectly promoted, fabricated execution claims, wrong-scope evidence and missed contradictions. Review false acceptance on a separate mutation suite containing missing sufficiency, invalid greedy exchange, off-by-one bounds, wrong sample, cyclic dependency, forged evidence and a lying comparator.

Proposed thresholds for deciding whether to proceed to a limited implementation pilot: all 54 coverage slots and permissions complete; zero accepted analyses with unresolved essential errors, fabricated tests, source-policy violations or label-only bottlenecks; at least 80% of all candidates mathematically accepted (others safely abstain or remain unverified); mean discovery-specificity, observation-chain **and bottleneck** scores at least 2.5/3; every accepted candidate passes tag-removal review; all nine misleading pairs rejected as equivalent; at least five of six preregistered positive-transfer pairs recognized; all critical mutation cases blocked. These are **proposed engineering gates, not measured results or calibrated statistical guarantees**. Human reviewers may require stronger gates before any release.

## Execution plan and stop conditions

1. Approve the design and resolve authorized statement sourcing and retention/sharing scope.
2. Review schemas/prompt isolation and build the constrained execution harness in a separately authorized phase; use synthetic fixtures first.
3. Select and freeze the 54-slot manifest, references, split and rubric; report unfilled slots honestly.
4. Obtain a specific paid-inference and pilot budget approval covering primary, blind verifier, critique and bounded retries. No bulk permission is implied.
5. Run development cases, review failures, freeze revisions, then run sealed evaluation once. Suspend on budget exhaustion, permission revocation, source leakage or credible systematic false acceptance.
6. Publish the measured report with artifacts, limitations, costs and an explicit go/no-go decision. Keep failed candidates out of training.

Phase 4A ends before step 1 approval. No model choice, benchmark correctness result, license permission or production safety result is claimed by this document.
