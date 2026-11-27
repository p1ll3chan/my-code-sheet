# Verification specification

Phase 4A proposal, 2026-10-15. No mathematical analyses, sandbox executions or independent model critiques have been run. A schema-valid response is not a correct solution; model confidence is not evidence. All promotions described here require later implementation and approval.

## Two independent inputs, then critique

Freeze the primary candidate and its statement hash. Start a fresh verifier context with only the same authorized, allowlisted statement and the blind-verification prompt. Do not provide the candidate, taxonomy, tags, editorials, known solutions or prior labels at this stage. The verifier derives a solution or reports inability and writes its own scoped claims and test ideas. Freeze that result before revealing the candidate.

In a second critique stage, provide the frozen candidate, the verifier's frozen derivation and separately collected, authenticated test evidence. Ask for a claim-by-claim comparison, concrete contradictions and unaddressed obligations. No retrieval or published solutions are allowed. Retain both stages and any disagreement. A different model family may reduce correlated mistakes if separately approved; the same model in a fresh context is only context-independent. Neither option guarantees epistemic independence or avoids pretraining contamination.

The [verification prompt](prompts/INDEPENDENT_VERIFICATION.md) has separate templates for these stages. A model can propose tests and objections, but cannot report a test as executed unless the runner supplied that evidence. Do not request hidden reasoning traces: request mathematical propositions, explicit proofs and reproducible counterexamples.

## Verification stages and evidence

| Stage | Check | Required record / failure behavior |
| --- | --- | --- |
| Intake | Current authorization, exact statement/input hash, allowed catalog rating, completeness and input isolation | Missing permission, invalid hash or ambiguous statement blocks analysis; no fallback scraping |
| Structure | Candidate schema, required solution sections, unique IDs, claim and observation DAGs, resolvable references, hint order | Invalid response quarantined; bounded repair attempts count against an approved budget; never silently fill a missing proof |
| Mathematical obligations | Assumptions, necessity and sufficiency separately, invariant initialization/preservation/use, termination, feasibility and optimality, all cases, complexity and numeric bounds | Each claim gets a scoped assessment, justification and evidence links; unsupported steps remain unverified |
| Discovery bottlenecks | For every proposed student wrong turn, check that it is plausible from the statement, its failure witness is legal and valid, the diagnostic question is usable before revealing the answer, and the linked observation actually resolves the issue | Each bottleneck gets a separate review result; no claimed observation of real students without private, consented evidence; algorithm labels alone fail pedagogical review |
| Samples | Every authorized example, exact input/output under the problem's output semantics | Retain per-case expected/actual result, implementation/input hashes and comparator version; mismatch blocks acceptance unless the sample/comparator is proven faulty |
| Edge cases | Smallest/largest legal sizes, zeros/signs if legal, equality/ties, odd/even, degenerate structures, boundaries of each claimed condition | Named cases and outcomes, reason chosen; invalid inputs do not refute a valid-input theorem |
| Differential | Independently specified brute-force oracle vs optimized candidate on legal small inputs, when feasible | Finite domain, generator version, seed/case count, input/output/code/runtime hashes, timeout and mismatch artifacts |
| Independent critique | Compare frozen blind derivation with candidate and test artifacts | Claim verdicts, contradictions, missing coverage, disagreements; agreement alone does not establish correctness |
| Human review | Review decisive discoveries, every essential proof obligation, algorithm/complexity, hints and evidence limitations | Named reviewer, analysis hash, explicit accepted obligations, remaining issues and rationale; incomplete review cannot promote |

Samples with multiple valid outputs require a separately reviewed feasibility/objective checker, not string equality. Numeric output needs a statement-justified tolerance. Interactive/output-only or environment-dependent tasks are marked `unsupported` until an appropriate authorized harness is designed; do not simulate them as ordinary batch problems. Resource measurements cannot prove asymptotic complexity.

The brute-force oracle must encode the original specification, not the candidate's optimized recurrence or disputed characterization. Write down the finite search space and prove enumeration completeness within its bounds. A reviewer checks the oracle and comparator; sharing the same bug with an optimized implementation is a known risk. If brute force is infeasible, record `unsupported` with a reason, use targeted properties/edges and manual proof review, and show the reduced evidence coverage. Missing tests never become implicit passes.

A metamorphic property needs its own justification and scope. Examples: applying a relabeling only if the problem is invariant under that relabeling, or checking a construction against all original constraints. Never assume scaling/sorting/reversal is valid just because it is convenient to test.

## Evidence records and safe execution

Evidence is immutable and linked to exact analysis, statement, implementation and tool versions. `VerificationEvidence` in [the design contracts](design/reasoning-contracts.ts) stores method, outcome (`pass`, `fail`, `inconclusive`, `unsupported`), scope, claim IDs, artifact hashes, nullable execution details and an explicit limitation. Execution details identify runner, environment image, command artifact, start/end, generator/seed/domain and case count. A signed or authenticated runner record is required in a future system; a JSON object claimed by a model is insufficient.

Keep expected and observed output and minimized counterexamples in scoped artifacts, not ordinary application logs. Reproduction instructions use an artifact manifest, not arbitrary shell commands supplied by a model. A reducer must preserve valid input constraints and re-run both programs before storing a smaller failure. Timeouts, compilation errors and runner crashes are inconclusive execution results, never proof that the mathematics is false or a check passed. A valid reproducible mismatch suspends the candidate until adjudicated; diagnose the candidate, oracle and comparator separately.

Treat all generated code and statements as untrusted. The later harness must have no network, application credentials, database access or mounted host workspace; run as an unprivileged user in an isolated disposable environment, read-only fixtures, temporary output quota, pinned language/toolchain, CPU/wall-clock/memory/process limits and deterministic locale. Proposed pilot limits: 2 CPU seconds per small case, 30 seconds per batch, 256 MiB memory, 16 processes, 10 MiB output; review per language/problem and record overrides. Harness setup is a prerequisite, not something Phase 4A installs. Do not execute model code through Express or the analyst's tool session.

## State machine and authority

Separate execution lifecycle (`queued`, `running`, `blocked`, `failed`, `finished`) from mathematical status and publication. A failed job is not a rejected theorem. Status changes are append-only decisions by a trusted service/operator, never fields accepted from the analyst.

| Mathematical status | Entry condition | What the UI may say |
| --- | --- | --- |
| `unreviewed` | Valid frozen candidate; no sufficient evidence | “Unreviewed derivation” |
| `tested` | At least one authenticated bounded execution passes; no unresolved contradictory evidence; show exactly what ran | “Samples/small cases tested; proof not yet reviewed” |
| `proof-reviewed` | Human reviewers accept all essential proof obligations, scoped assumptions, algorithm and complexity; independent critique completed; all applicable sample checks pass; unsupported test categories explicitly justified; no open material contradictions | “Proof reviewed for this statement version,” with evidence and limits |
| `disputed` | A credible contradiction, new evidence or unresolved reviewer disagreement affects a previously eligible candidate | “Disputed; unavailable for training” |
| `rejected` | Adjudicated essential error, with recorded counterexample or proof defect | “Rejected candidate” |

Use `proof-reviewed` instead of a broad `verified` label. A claim may have bounded test support while another remains unsupported; retain per-claim results. A proof-reviewed analysis does not automatically verify every pedagogical difficulty estimate or similarity relation. Formal checking, if added later, gets its own method, formal statement and trusted-base record; do not imply it exists now.

Maintain a separate freshness/access state: `current`, `stale`, `revoked`. Only current, permitted, proof-reviewed analyses with accepted normalization **and accepted bottleneck review** are publishable to the reasoning knowledge snapshot. Student-facing hints also require correctness and progressive-disclosure review. Stale/revoked/disputed knowledge is excluded even if an earlier decision passed. Revocation may require removing retained content according to permission terms.

Every promotion checks actor privilege, exact hashes, all essential claim coverage, authentic evidence, conflict state, statement rights, and applicable execution coverage inside a transaction. No arithmetic average of confidence or majority vote can substitute. The contracts are a design envelope, not an implementation of this policy. A partial/blocked candidate cannot be promoted. A corrected derivation is a new revision verified from its own hash, with supersession links; old artifacts remain subject to retention authorization.

## Contradiction handling and release gates

An objection identifies the affected claim, legal input/domain or logical gap, expected implication, observed counterexample or argument, and evidence references. The reviewer records whether it is valid, invalid or unresolved with rationale. Fail closed for unresolved essential objections. Preserve disagreements about correctness separately from disagreements about the best pedagogical framing.

Before enabling a worker, test spoofed execution records, foreign-analysis evidence, stale hashes, attempts by ordinary users/models to promote, cycle/dangling references, unsupported test promotion, invalid counterexamples and statement revocation mid-run. Before enabling any knowledge-consuming planner, test snapshot invalidation, owner isolation and baseline fallback. These are future integration acceptance requirements, not claims of tests executed in this design phase.
