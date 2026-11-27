import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analysisCandidateSchema, analysisEnvelopeSchema, analysisInputSchema, critiqueReportSchema,
  knowledgeDecisionSchema, similarityProposalSchema, verificationEvidenceSchema,
  type AnalysisCandidate,
} from "../docs/design/reasoning-contracts";

// Synthetic structural fixtures only: no CF statement, provider or runner is used.
const digest = "a".repeat(64);
const unknown = () => ({ status: "unknown" as const, content: null, reason: "Synthetic fixture omits this section." });
function blocked(): AnalysisCandidate {
  return {
    schemaVersion: "analysis-candidate/0.2", disposition: "blocked", dispositionReason: "Incomplete synthetic input.",
    recognition: { status: "unknown", explanation: "No model invocation." }, claims: [],
    coreDiscovery: unknown(), initialFormulation: unknown(), naiveApproaches: unknown(), discoveryBottlenecks: unknown(), transformations: unknown(),
    observations: unknown(), conditions: unknown(), structuralProperties: unknown(), algorithm: unknown(), proof: unknown(),
    complexity: unknown(), implementationDifficulty: unknown(), discoveryDifficulty: unknown(), proofDifficulty: unknown(),
    prerequisites: unknown(), transferableConcepts: unknown(), trainingPurposes: unknown(), hints: unknown(),
    uncertainties: [{ scope: "fixture", issue: "No real analysis.", consequence: "Not publishable.", neededEvidence: "Actual authorized derivation and review." }],
  };
}
function complete(): AnalysisCandidate {
  const value = blocked();
  value.disposition = "complete";
  value.dispositionReason = "Synthetic identity-output exercise, for structural checks only.";
  value.claims = [{ id: "c1", assertion: "Returning the supplied integer returns itself.", assumptions: ["Input is one integer."],
    justification: "The output is defined to be the input.", dependsOn: [], gaps: [] }];
  value.coreDiscovery = { status: "present", reason: null, content: { explanation: "The identity map suffices.", claimIds: ["c1"] } };
  value.observations = { status: "present", reason: null, content: [{ id: "o1", proposition: "No transformation is required.", role: "essential", dependsOn: [], claimIds: ["c1"] }] };
  value.discoveryBottlenecks = { status: "present", reason: null, content: [{
    id: "b1", learnerAssumption: "Assume the stated one-integer task hides an iteration.", temptingMove: "Search for a recurrence.",
    whyTempting: "Training problems often ask for a computation.", failureMode: "missing-representation",
    failureWitness: "The output specification already equals the input for every legal value.",
    diagnosticQuestion: "What must change between the supplied input and requested output?", pivotObservationIds: ["o1"],
    resolution: "Recognizing identity makes the direct algorithm available.",
  }] };
  value.algorithm = { status: "present", reason: null, content: { steps: [{ instruction: "Return input.", observationIds: ["o1"] }], terminationClaimId: "c1" } };
  value.proof = { status: "present", reason: null, content: { theorem: "Output equals input.", obligations: [{ id: "p1", claimIds: ["c1"], assumptions: [], argument: "By definition of the identity map.", resolution: "argued" }] } };
  value.complexity = { status: "present", reason: null, content: { variables: "One machine integer.", time: "O(1)", space: "O(1)", justification: "One copy.", claimIds: ["c1"] } };
  value.hints = { status: "present", reason: null, content: [
    { id: "h1", level: 1, text: "Compare requested output and input.", intendedReveal: "Attend to equality.", spoiler: "attention", observationIds: ["o1"], dependsOnHintIds: [] },
    { id: "h2", level: 2, text: "Return the input directly.", intendedReveal: "Identity algorithm.", spoiler: "algorithm", observationIds: ["o1"], dependsOnHintIds: ["h1"] },
  ] };
  return value;
}

test("analysis input is a strict allowlist at every level and preserves content bytes", () => {
  const input = { schemaVersion: "analysis-input/0.1", statementVersionRef: "statement-fixture", contentHash: digest, locale: "en",
    statement: "  Synthetic statement.\n", inputSpecification: "One integer.", outputSpecification: "Same integer.", constraints: ["Machine integer."],
    examples: [{ input: " 1\n", output: "1\n", explanation: null }] };
  assert.deepEqual(analysisInputSchema.parse(input), input);
  for (const key of ["tags", "editorial", "solutions", "communityExplanation", "reasoningLabels", "rating", "title", "userId", "problemKey", "verificationStatus"]) {
    assert.equal(analysisInputSchema.safeParse({ ...input, [key]: "forbidden" }).success, false, key);
  }
  assert.equal(analysisInputSchema.safeParse({ ...input, examples: [{ ...input.examples[0], tags: ["math"] }] }).success, false);
  assert.equal(analysisInputSchema.safeParse({ ...input, contentHash: "not-a-hash" }).success, false);
});

test("absent sections require a reason and a complete candidate cannot omit solution obligations", () => {
  assert.equal(analysisCandidateSchema.safeParse(blocked()).success, true);
  assert.equal(analysisCandidateSchema.safeParse(complete()).success, true);
  assert.equal(analysisCandidateSchema.safeParse({ ...blocked(), disposition: "complete" }).success, false);
  assert.equal(analysisCandidateSchema.safeParse({ ...blocked(), coreDiscovery: { ...unknown(), reason: " " } }).success, false);
  assert.equal(analysisCandidateSchema.safeParse({ ...blocked(), coreDiscovery: { ...unknown(), content: "invented" } }).success, false);
});

test("candidate rejects trusted status, labels, confidence and nested unknown fields", () => {
  for (const key of ["verificationStatus", "confidence", "taxonomyLabels", "provider", "evidence"]) {
    assert.equal(analysisCandidateSchema.safeParse({ ...complete(), [key]: "untrusted" }).success, false, key);
  }
  const value = complete();
  assert.equal(analysisCandidateSchema.safeParse({ ...value, claims: [{ ...value.claims[0], verified: true }] }).success, false);
});

test("claims and observations reject duplicates, self edges, cycles and dangling dependencies", () => {
  for (const dependsOn of [["c1"], ["missing"], ["c2"]]) {
    const value = complete(); value.claims[0].dependsOn = dependsOn;
    value.claims.push({ ...value.claims[0], id: "c2", dependsOn: ["c1"] });
    assert.equal(analysisCandidateSchema.safeParse(value).success, false);
  }
  const duplicate = complete(); duplicate.claims.push({ ...duplicate.claims[0] });
  assert.equal(analysisCandidateSchema.safeParse(duplicate).success, false);
  const observation = complete();
  if (observation.observations.status === "present") observation.observations.content[0].dependsOn = ["o1"];
  assert.equal(analysisCandidateSchema.safeParse(observation).success, false);
});

test("all support references resolve and complete candidates declare no open proof gaps", () => {
  const missingClaim = complete();
  if (missingClaim.coreDiscovery.status === "present") missingClaim.coreDiscovery.content.claimIds = ["foreign-claim"];
  assert.equal(analysisCandidateSchema.safeParse(missingClaim).success, false);
  const missingObservation = complete();
  if (missingObservation.algorithm.status === "present") missingObservation.algorithm.content.steps[0].observationIds = ["missing"];
  assert.equal(analysisCandidateSchema.safeParse(missingObservation).success, false);
  const gap = complete(); gap.claims[0].gaps = ["Unsupported implication."];
  assert.equal(analysisCandidateSchema.safeParse(gap).success, false);
  const open = complete(); if (open.proof.status === "present") open.proof.content.obligations[0].resolution = "open";
  assert.equal(analysisCandidateSchema.safeParse(open).success, false);
});

test("complete analysis requires a concrete bottleneck linked to the unlocking observation", () => {
  const absent = complete(); absent.discoveryBottlenecks = unknown();
  assert.equal(analysisCandidateSchema.safeParse(absent).success, false);
  const generic = complete();
  if (generic.discoveryBottlenecks.status === "present") generic.discoveryBottlenecks.content[0].pivotObservationIds = ["missing-observation"];
  assert.equal(analysisCandidateSchema.safeParse(generic).success, false);
  const duplicate = complete();
  if (duplicate.discoveryBottlenecks.status === "present") duplicate.discoveryBottlenecks.content.push({ ...duplicate.discoveryBottlenecks.content[0] });
  assert.equal(analysisCandidateSchema.safeParse(duplicate).success, false);
  const nonessentialPivot = complete();
  if (nonessentialPivot.observations.status === "present") nonessentialPivot.observations.content.push({ id: "o2", proposition: "Supporting detail.", role: "supporting", dependsOn: ["o1"], claimIds: ["c1"] });
  if (nonessentialPivot.discoveryBottlenecks.status === "present") nonessentialPivot.discoveryBottlenecks.content[0].pivotObservationIds = ["o2"];
  assert.equal(analysisCandidateSchema.safeParse(nonessentialPivot).success, false);
});

test("hints require increasing levels, non-regressing spoiler levels and earlier dependencies", () => {
  for (const mutation of ["level", "spoiler", "dependency"]) {
    const value = complete();
    if (value.hints.status === "present") {
      if (mutation === "level") value.hints.content[1].level = 1;
      if (mutation === "spoiler") { value.hints.content[0].spoiler = "algorithm"; value.hints.content[1].spoiler = "attention"; }
      if (mutation === "dependency") value.hints.content[0].dependsOnHintIds = ["h2"];
    }
    assert.equal(analysisCandidateSchema.safeParse(value).success, false, mutation);
  }
});

test("provenance distinguishes private owner scope and preserves unknown usage", () => {
  const envelope = { schemaVersion: "analysis-envelope/0.1", analysisId: "fixture-analysis", revision: 1, problemKey: "synthetic:identity",
    statementVersionRef: "fixture-statement", statementHash: digest, provider: "mock", model: "mock", modelRevision: null, settings: {},
    promptVersion: "primary-analysis/0.2", promptHash: digest, contractVersion: "analysis-candidate/0.2", inputHash: digest, outputHash: digest,
    inputPolicyVersion: "isolation/0.1", inputPolicyPassed: true, authorizationGrantRef: "fixture-grant", scope: "private", ownerId: 1,
    startedAt: "2026-10-15T00:00:00Z", finishedAt: "2026-10-15T00:00:00.100Z", usageTokens: null, costUsd: null };
  assert.equal(analysisEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(analysisEnvelopeSchema.safeParse({ ...envelope, ownerId: null }).success, false);
  assert.equal(analysisEnvelopeSchema.safeParse({ ...envelope, scope: "shared" }).success, false);
  assert.equal(analysisEnvelopeSchema.safeParse({ ...envelope, finishedAt: "2026-10-14T00:00:00Z" }).success, false);
});

test("bounded execution evidence needs cases and artifact references; unsupported stays explicit", () => {
  const evidence = { schemaVersion: "verification-evidence/0.1", evidenceId: "fixture-evidence", analysisId: "fixture-analysis",
    analysisHash: digest, statementHash: digest, method: "differential", outcome: "unsupported", scope: "Synthetic contract test.", claimIds: ["c1"],
    producerRef: "fixture", toolVersion: "none", createdAt: "2026-10-15T00:00:00Z", limitations: "No execution happened.", artifacts: [], execution: null };
  assert.equal(verificationEvidenceSchema.safeParse(evidence).success, true);
  assert.equal(verificationEvidenceSchema.safeParse({ ...evidence, outcome: "pass" }).success, false);
  const structurallyExecuted = { ...evidence, outcome: "pass", artifacts: [{ role: "command", ref: "cmd-fixture", sha256: digest }],
    execution: { runnerRef: "mock", environmentHash: digest, implementationHash: digest, commandArtifactRef: "cmd-fixture", comparatorVersion: "mock",
      generatorVersion: "mock", seed: "1", domain: "Synthetic only", caseCount: 1, startedAt: "2026-10-15T00:00:00Z", finishedAt: "2026-10-15T00:00:01Z" } };
  assert.equal(verificationEvidenceSchema.safeParse(structurallyExecuted).success, true); // Parsing is not authentication.
  assert.equal(verificationEvidenceSchema.safeParse({ ...structurallyExecuted, artifacts: [] }).success, false);
  assert.equal(verificationEvidenceSchema.safeParse({ ...structurallyExecuted, execution: { ...structurallyExecuted.execution, caseCount: 0 } }).success, false);
});

test("critique cannot duplicate claims or assert executed contradictions without references", () => {
  const report = { schemaVersion: "critique-report/0.2", analysisId: "fixture", analysisHash: digest, blindDerivationHash: digest,
    claimReviews: [{ claimId: "c1", verdict: "gap", scope: "Synthetic only.", rationale: "Review not performed.", evidenceIds: [] }],
    bottleneckReviews: [{ bottleneckId: "b1", verdict: "outside-review", failureWitnessAssessment: "Not reviewed.", pivotAssessment: "Not reviewed.", rationale: "Synthetic only." }], contradictions: [],
    hintReview: "Not reviewed.", unresolvedIssues: ["No real analysis."], requiredChecks: ["Human review."], recommendation: "abstain" };
  assert.equal(critiqueReportSchema.safeParse(report).success, true);
  assert.equal(critiqueReportSchema.safeParse({ ...report, claimReviews: [...report.claimReviews, ...report.claimReviews] }).success, false);
  assert.equal(critiqueReportSchema.safeParse({ ...report, bottleneckReviews: [...report.bottleneckReviews, ...report.bottleneckReviews] }).success, false);
  assert.equal(critiqueReportSchema.safeParse({ ...report, contradictions: [{ claimIds: ["c1"], argumentOrCounterexample: "Mock.", reproduction: "executed", evidenceIds: [] }] }).success, false);
});

test("decisions and accepted similarities require review provenance but do not grant authority", () => {
  const decision = { schemaVersion: "knowledge-decision/0.1", decisionId: "d1", analysisId: "fixture", analysisHash: digest,
    status: "unreviewed", freshness: "current", actorRef: "fixture", decidedAt: "2026-10-15T00:00:00Z", evidenceIds: [], reviewIds: [],
    rationale: "Synthetic contract test only.", supersedesDecisionId: null };
  assert.equal(knowledgeDecisionSchema.safeParse(decision).success, true);
  assert.equal(knowledgeDecisionSchema.safeParse({ ...decision, status: "proof-reviewed" }).success, false);
  assert.equal(knowledgeDecisionSchema.safeParse({ ...decision, status: "proof-reviewed", evidenceIds: ["e1"] }).success, false);
  const pair = { schemaVersion: "similarity-proposal/0.1", leftAnalysisId: "left", leftAnalysisHash: digest, rightAnalysisId: "right", rightAnalysisHash: digest,
    relation: "contrast-pair", correspondences: [{ leftObservationIds: ["o1"], rightObservationIds: ["o1"], rationale: "Synthetic comparison only." }],
    assumptionDifferences: "Not reviewed.", sharedDiscovery: "None asserted.", reviewState: "proposed", reviewerRef: null };
  assert.equal(similarityProposalSchema.safeParse(pair).success, true);
  assert.equal(similarityProposalSchema.safeParse({ ...pair, reviewState: "accepted" }).success, false);
  assert.equal(similarityProposalSchema.safeParse({ ...pair, rightAnalysisId: "left" }).success, false);
});
