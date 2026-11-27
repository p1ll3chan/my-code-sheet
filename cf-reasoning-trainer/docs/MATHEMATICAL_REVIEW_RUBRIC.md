# Mathematical review rubric — math-review/1

Review the frozen statement/solution/classification and bounded evidence without seeing model identity, comparison arm, automated score or another reviewer's decisions. `export ... blind` provides that packet under a random case UUID. First derive the decisive obligations yourself. Then consult a separately prepared reference if authorized; a reference is not automatically correct. Record recognition or suspected model unblinding in notes. Human review is performed by a person; no model or scripted fixture submission should be represented as a human judgment.

Use `pass`, `fail` or `uncertain` independently for each criterion, with a checkable rationale. Uncertainty is not a pass. Two distinct, independent reviewers are required for an initial consensus. A reviewer identity is an operator-recorded attribution, not cryptographically verified identity; only trusted local operators can import reviews. No player-facing review mutation API exists.

| Judgment key | Pass requires | Failure examples |
| --- | --- | --- |
| `algorithm` | Valid on every legal input, terminates, obeys numeric/resource limits; program matches the stated algorithm | Counterexample, invalid construction, missed boundary, exponential work under large constraints |
| `proof` | All essential claims justified under explicit assumptions; necessity and sufficiency, termination and optimality where applicable | Circular claim, one implication presented as iff, unproved exchange, empirical tests used as universal proof |
| `primaryInsight` | The precise proposition that unlocks the problem is identified | “Greedy” or “sorting” with no mathematical pivot; correct observation that is not the decisive one |
| `secondaryObservations` | Supporting observations are meaningful, complete and linked in a valid dependency order | Missing wraparound condition, omitted feasibility precondition, disconnected filler |
| `reasoningClassification` | Facets describe discovery, proof and implementation separately; the tag-removal test succeeds | Algorithm synonyms masquerading as discoveries; wrong failure witness; irrelevant taxonomy mapping |
| `prerequisites` | Knowledge truly needed by the stated learner is identified and distinguished from what must be discovered | Treating the answer as a prerequisite, missing parity/modular/ordering knowledge |
| `difficulty` | Discovery/proof/implementation axes have defensible learner-relative rationales | Copying CF rating into all axes; unsupported claims about real students; simple code treated as easy discovery |
| `trainingUsefulness` | Fingerprint can select a useful discovery/transfer/contrast exercise, with limitations clear | Vague labels cannot distinguish superficially similar problems, wrong insight yields harmful training |

The **tag-removal test** hides broad labels and the algorithm facet. The remaining explanation must still identify the tempting move, why the statement suggests it, a valid failure witness, a useful diagnostic question, the resolving observation and why it changes the solution. A witness must obey the statement. Distinguish a learner hypothesis from observed student behavior.

Check samples, oracle scope and recorded counterexamples, but do not substitute these for a proof. Review the full statement constraints: the harness intentionally tests a much smaller domain. An execution timeout is inconclusive; a valid output mismatch demands investigation of candidate, oracle and comparator. Unsupported execution prevents automated fixture acceptance even if a reviewer considers the prose promising.

## Import format

For every packet, create JSON with these fields. Include **all eight judgment keys** from the table, each with `verdict` and a nonempty `rationale`:

```json
{
  "reviewer": "reviewer-reference",
  "artifactHash": "<exact 64-character hash from the blind packet>",
  "rubricVersion": "math-review/1",
  "purpose": "assessment",
  "independent": true,
  "judgments": {
    "algorithm": { "verdict": "uncertain", "rationale": "State the unresolved obligation." },
    "proof": { "verdict": "uncertain", "rationale": "State the unresolved obligation." },
    "primaryInsight": { "verdict": "uncertain", "rationale": "Explain the missing evidence." },
    "secondaryObservations": { "verdict": "uncertain", "rationale": "Explain the missing evidence." },
    "reasoningClassification": { "verdict": "uncertain", "rationale": "Apply the tag-removal test." },
    "prerequisites": { "verdict": "uncertain", "rationale": "Identify the learner assumptions." },
    "difficulty": { "verdict": "uncertain", "rationale": "Assess each difficulty axis." },
    "trainingUsefulness": { "verdict": "uncertain", "rationale": "Explain potential use and limitations." }
  },
  "failures": [],
  "notes": "Record recognition, oracle limitations, conflicts and unresolved questions."
}
```

The placeholder hash must be replaced before import. Reviews are append-only and duplicate submissions by the same reviewer for one artifact are rejected. A correction to mathematics creates a new candidate/run version; it does not overwrite the contested evidence. Disagreements remain stored and block acceptance; the framework does not use majority vote to erase them. This initial implementation deliberately has no automatic adjudication/override path.

For an independent post-acceptance audit, use `purpose: "audit"` and a different reviewer identity. An audit is accepted only after two passing assessment reviews; any material objection removes the result from evaluation acceptance. This supplies the denominator for verification precision and avoids scoring the original reviewers against themselves.

## Failure categories and action

Use `incorrect-discovery`, `missing-observation`, `invalid-proof`, `incorrect-algorithm`, `incorrect-complexity`, `misleading-classification`, `missing-prerequisite`, `incorrect-similarity`, `unsupported-claim`, `verification-failure` or `statement-ambiguity`, each with a concrete `detail`. Infrastructure also records `invalid-output` and `provider-failure`. Reports retain IDs, frozen outputs and counterexamples so representative failures can be inspected.

An algorithm counterexample calls for solution repair and renewed verification. A proof gap calls for a specific missing lemma, not a stronger-model confidence vote. A valid algorithm with misleading classification calls for revising the classification/bottleneck prompt and rerunning the tag-removal test. A new concept needs taxonomy normalization review. Statement ambiguity calls for authorized source correction. No actual model-driven prompt or taxonomy improvement is claimed until reviewed failures support it.
