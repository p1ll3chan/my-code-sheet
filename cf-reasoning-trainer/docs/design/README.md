# Phase 4A contract proposals

`reasoning-contracts.ts` contains strict Zod definitions using the project's existing dependency. These are executable **design artifacts**, referenced only by `tests/reasoning-design.test.ts`. Candidate contract version `0.2` is pending design review, not a stable production API. It adds a required predicted discovery bottleneck for complete analyses.

| Export | Producer and purpose |
| --- | --- |
| `analysisInputSchema` | Trusted host constructs the only statement data visible to either blind analyst |
| `analysisCandidateSchema` | Untrusted model output, including scoped claims, observations and all derivation sections |
| `analysisEnvelopeSchema` | Trusted host records provenance, permission scope and exact run versions |
| `verificationEvidenceSchema` | Authenticated runner/reviewer records checks and their bounded scope |
| `critiqueReportSchema` | Untrusted verifier proposes per-claim findings after its blind derivation is frozen |
| `knowledgeDecisionSchema` | Privileged decision process records status; parsing alone grants no authority |
| `similarityProposalSchema` | Post-analysis comparison proposes observation correspondences; reviewed separately |

Statements, examples and output are preserved as strings without trimming. Perform documented canonical newline normalization before hashing; retain original source/version provenance. The 60,000-character per-text-field and 128-item limits are proposed defensive bounds, not permission to truncate oversized input. Block and explicitly review a larger contract version if legitimate content exceeds them. Total request/output limits and provider context limits must also be enforced later. No numeric confidence value acts as a verification switch.

Structural validation checks strict fields, absent-section reasons, earlier-node DAGs, reference resolution, links from predicted bottlenecks to pivot observations, hint order and minimum evidence/reviewer references. It intentionally cannot tell whether a student would actually get stuck, whether a failure witness is valid, verify mathematics, source authorization, the authenticity of evidence or whether free text contains a copied editorial. The specification's human and service checks remain required.

Before production, add transaction-level checks across envelopes: statement and analysis hashes match; evidence is authentic and belongs to that exact analysis/scope; critiques cover every candidate claim and bottleneck once and reference only supplied evidence; similarity references exist in both analyses and rights permit comparison; normalization IDs resolve in the pinned taxonomy; proof-review decisions cover all essential obligations and no unresolved contradictions; actor permissions and current rights are valid. No stubbed or fabricated record may satisfy these gates. Validate the output contract against the selected provider's structured-output dialect without weakening checks to suit a provider.

Prompt version IDs permit `/` (for example `primary-analysis/0.2`); opaque record IDs do not. Contract versions are explicit literals. A change to field meaning or constraints increments the contract version, retains old parsers for historical artifacts when authorized, and requires migration/reader compatibility review. JSONB storage does not waive schema validation or cross-record SQL constraints.

Current structural tests use only synthetic fixtures. They test policy boundaries such as disallowed input fields and unsupported execution claims. They do not execute mathematical programs, call a model, authenticate a runner or exercise application security. See `ANALYSIS_SPEC.md` and `VERIFICATION_SPEC.md` one directory above for the full architecture and promotion policy.
