# Reasoning taxonomy

Phase 4A design proposal, revised after design review on 2026-10-15. Vocabulary version `reasoning-taxonomy/0.2`. No problems have been analyzed or labeled by this phase. This vocabulary describes discoveries in problems rated **1200–2000 inclusive**, not a replacement difficulty scale.

## Unit of classification

A discovery is a precise, scoped proposition that changes how the problem can be solved. “Greedy,” “math,” “ad-hoc,” and “use sorting” are not core discoveries. For example, the synthetic proposition “under an adjacent-swap operation, exchanging an inverted neighboring pair changes inversion parity” states an operation, a property and a consequence; `secondary.parity` alone does not. Any actual use would still need the exact operation assumptions and proof.

Record the proposition and its observation/proof dependencies first. Normalize concepts only **after a blind analysis has been frozen**. The primary analyst receives neither this vocabulary nor another problem's assigned labels. A separate normalization pass may see the frozen analysis and this controlled vocabulary, but cannot rewrite its mathematical conclusions. Human review accepts or rejects mappings.

## The student sticking point is the unit of training

For every complete analysis, record at least one **predicted discovery bottleneck**: (1) the assumption a prerequisite-equipped student might make, (2) the tempting move that follows, (3) why the statement makes it tempting, (4) a specific counterexample, complexity bound, or proof gap showing its limit, (5) a diagnostic question the student could ask, (6) the essential observation that resolves it, and (7) why that observation changes what can be done. Link the bottleneck to exact observation IDs. The explanation should still make sense if all taxonomy and algorithm labels are hidden.

This is a hypothesis about a learner, not evidence that any particular player got stuck. The blind analyst sees no private student history. Later training data may test the hypothesis against a student's recorded observations, pauses, hints and outcome, with consent and account isolation. Do not convert a plausible story into a claimed measured difficulty. If no defensible bottleneck can be identified, keep the candidate partial instead of filling it with “requires insight” or an algorithm name.

Two **synthetic** examples show why an algorithm label is insufficient. Minimum adjacent swaps to sort a permutation and maximum nonoverlapping intervals can both involve sorting. For swaps, counting misplaced positions is tempting but wrong: `[2,3,1]` has three displaced positions and needs two adjacent swaps. Asking what one adjacent swap changes leads to inversion count. For intervals, choosing the earliest starting interval is tempting but wrong: `[1,10]`, `[2,3]`, `[4,5]` yields one chosen interval by that rule instead of two. Asking which first choice leaves the most room leads to the earliest finishing interval and an exchange argument. The same surface tag does not describe either wrong turn, counterexample, diagnostic question or pivot.

Reviewers use a tag-removal test: hide the algorithmic-technique facet and broad discovery labels. Can they still tell *why the tempting approach fails, which question could unlock the problem, and what precise observation answers it*? If not, return the analysis for revision. A list of more detailed tags fails this test.

## Separate facets

| Facet | Meaning and cardinality | Initial canonical concepts |
| --- | --- | --- |
| Primary discovery mechanism | The decisive change in representation or argument; zero when unknown, normally one, at most two with a genuinely inseparable joint discovery | `discovery.representation-change`, `discovery.invariant`, `discovery.monovariant`, `discovery.extremal-choice`, `discovery.exchange`, `discovery.feasibility-characterization`, `discovery.reverse-process`, `discovery.decomposition`, `discovery.counting-correspondence`, `discovery.symmetry`, `discovery.bound-attainment`, `discovery.state-sufficiency` |
| Secondary mathematical observation | Supporting facts, each linked to a concrete claim; zero or more | `secondary.parity`, `secondary.modular-conservation`, `secondary.order-monotonicity`, `secondary.local-global`, `secondary.interval-structure`, `secondary.independence`, `secondary.cancellation`, `secondary.periodicity`, `secondary.pigeonhole`, `secondary.connectivity` |
| Proof technique | How a claim is justified, not what is discovered | `proof.direct`, `proof.induction`, `proof.contradiction`, `proof.exchange`, `proof.invariant-preservation`, `proof.bijection`, `proof.double-counting`, `proof.case-analysis`, `proof.lower-bound-construction` |
| Algorithmic technique | Implementation of the derived result, separate from the discovery | `algorithm.scan`, `algorithm.sort`, `algorithm.greedy`, `algorithm.binary-search`, `algorithm.two-pointers`, `algorithm.prefix-aggregation`, `algorithm.dynamic-programming`, `algorithm.graph-traversal`, `algorithm.disjoint-set`, `algorithm.range-query`, `algorithm.enumeration`, `algorithm.arithmetic`, `algorithm.constructive` |
| Discovery obstacle | A reviewed summary of a concrete bottleneck and its failed move, never a substitute for that record | `obstacle.process-fixation`, `obstacle.local-choice-trap`, `obstacle.large-state-space`, `obstacle.hidden-constraint`, `obstacle.false-analogy`, `obstacle.representation-mismatch`, `obstacle.multiple-insights`, `obstacle.boundary-case` |
| Concept prerequisite | Knowledge needed before the discovery, not the discovery itself | `concept.parity`, `concept.modular-arithmetic`, `concept.order`, `concept.sets-counting`, `concept.graphs`, `concept.induction`, `concept.asymptotics`, `concept.recurrences`, `concept.prefix-sums` |
| Transferable reasoning skill | An action a student could use on another problem | `skill.change-representation`, `skill.seek-conserved-quantity`, `skill.test-extremes`, `skill.separate-necessity-sufficiency`, `skill.construct-counterexample`, `skill.reverse-operations`, `skill.find-exchange`, `skill.compress-state`, `skill.decompose`, `skill.build-correspondence`, `skill.connect-observations` |

These are seed concepts, not coverage claims. A conventional algorithmic problem can have `discovery.state-sufficiency` with a precise recurrence-state observation; do not invent a surprising mathematical trick to make it fit. Empty facets are allowed with a reason. The same word in different facets has a different role: `discovery.exchange` locates the insight; `proof.exchange` identifies a justification.

## Boundary rules for the primary mechanisms

| Mechanism | Include when | Distinguish from |
| --- | --- | --- |
| Representation change | A new quantity/object makes the original condition simpler; record the equivalence | Cosmetic renaming or merely choosing a data structure |
| Invariant | A quantity/property is preserved by every allowed transition | A monovariant, which changes in one direction |
| Monovariant | A strictly or weakly ordered measure controls progress, termination or feasibility | Observed monotonicity on a few samples |
| Extremal choice | Choosing a smallest/largest witness forces structure | A greedy implementation without an extremal argument |
| Exchange | A local replacement preserves feasibility and cannot worsen the objective | An unexplained local rule |
| Feasibility characterization | A precise necessary-and-sufficient predicate replaces process simulation | A necessary condition alone |
| Reverse process | Reversing operations removes ambiguity or exposes a constructive order | Traversing an array backwards without a new insight |
| Decomposition | Solving pieces suffices, with explicit boundary/interdependence conditions | Splitting into arbitrary subproblems |
| Counting correspondence | A mapping, multiplicity or complementary count makes enumeration tractable | A formula without a counting argument |
| Symmetry | Equivalent configurations can be identified or canonicalized without losing outcomes | Assuming equal-looking cases are interchangeable |
| Bound attainment | A proven lower/upper bound and matching construction determine the answer | An unattained numerical estimate |
| State sufficiency | A small summary retains everything required for future decisions | Naming dynamic programming without proving the state adequate |

## Registry and normalization governance

Each concept has immutable `id`, facet, preferred label, definition, inclusion/exclusion criteria, optional parent IDs, aliases, positive/negative **synthetic** examples, version introduced, status (`proposed`, `active`, `deprecated`), reviewer and change rationale. Parent links form a DAG within a facet. An alias resolves to exactly one active concept in that facet; identifiers are never reused. Cross-facet relationships are explicit links, not aliases.

An analyst's free-text concept is stored as a proposal. The normalizer returns existing IDs with observation/claim references and a mapping rationale, or `unmapped` plus a proposed definition. It cannot create an active ID. A reviewer searches definitions and aliases, checks whether the proposed distinction changes training or discovery-level comparison, and then maps, adds an alias, or approves a new concept. Spelling variations and synonyms become aliases. Splits/merges require a new vocabulary version, migration mapping and review of affected assignments; historical labels remain pinned to their old version.

Accept at most two primary mechanisms, and only supporting facets actually evidenced in the fingerprint. Map each obstacle concept to a reviewed bottleneck ID and each discovery mechanism to its resolving observation; a label without that link is rejected. Do not label every prerequisite as a discovery. Normalize the whole pilot jointly before approving vocabulary expansion; unresolved cases stay unclassified rather than forcing an “ad-hoc” bucket. Version changes are reviewed changes, never model-generated database writes.

## Discovery-level similarity and training use

Comparison occurs after both independent analyses and rights checks. Store a directed comparison with exact analysis versions, shared discovery claims, a correspondence between observation nodes, crucial differences in assumptions, and a reviewer decision. Distinguish `same-discovery`, `partial-transfer`, `surface-only`, and `contrast-pair`. A shared algorithm or equal rating is insufficient evidence of the first two.

Initially use reviewed mappings and deterministic overlap of primary mechanisms, transferable skills and observation dependencies to propose comparisons. No vector store is necessary. Scores rank review candidates; they do not prove equivalence. Include false-friend pairs that look similar but require incompatible conditions, and different-looking problems with the same discovery. Do not expose another account's private statement or comparison.

Training purposes are a separate small enum: `discovery`, `proof`, `transfer`, `contrast`, `speed`, `implementation`, `review`. A purpose references the exact observations/skills being practiced. Future selection can consume accepted, versioned mappings without an LLM deciding the daily plan. Until that integration is authorized and evaluated, the Phase 3 baseline remains unchanged.
