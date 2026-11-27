/** Phase 4A design contracts only. No application runtime imports or provider calls. */
import { z } from "zod";

// Preserve source whitespace: parsing must not silently change statement/sample hashes.
const text = z.string().min(1).max(60_000).refine(value => /\S/.test(value), "text must not be blank");
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/);
const version = z.string().regex(/^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const refs = z.array(id).max(128);
const nonemptyRefs = refs.min(1);
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).min(1).max(128);
const section = <T extends z.ZodTypeAny>(content: T) => z.discriminatedUnion("status", [
  object({ status: z.literal("present"), content, reason: z.null() }),
  object({ status: z.literal("not-applicable"), content: z.null(), reason: text }),
  object({ status: z.literal("unknown"), content: z.null(), reason: text }),
]);
const supportedText = object({ explanation: text, claimIds: nonemptyRefs });
const difficulty = object({ level: z.number().int().min(1).max(5), learnerBackground: text, rationale: text });
export const trainingPurpose = z.enum(["discovery", "proof", "transfer", "contrast", "speed", "implementation", "review"]);

/** Strict model-visible allowlist. Authorization must be checked before parsing/serialization. */
export const analysisInputSchema = object({
  schemaVersion: z.literal("analysis-input/0.1"), statementVersionRef: id, contentHash: hash,
  locale: z.string().min(2).max(40), statement: text,
  inputSpecification: text, outputSpecification: text, constraints: list(text),
  examples: z.array(object({ input: z.string().max(60_000), output: z.string().max(60_000), explanation: text.nullable() })).max(128),
});

export const candidateShape = object({
  schemaVersion: z.literal("analysis-candidate/0.2"), disposition: z.enum(["complete", "partial", "blocked"]),
  dispositionReason: text,
  recognition: object({ status: z.enum(["not-recognized", "possibly-recognized", "recognized", "unknown"]), explanation: text }),
  claims: z.array(object({ id, assertion: text, assumptions: z.array(text).max(128), justification: text,
    dependsOn: refs, gaps: z.array(text).max(128) })).max(128),
  coreDiscovery: section(supportedText),
  initialFormulation: section(object({ apparentTask: text, obstacle: text })),
  naiveApproaches: section(list(object({ approach: text, limitation: text, counterexampleOrBound: text }))),
  discoveryBottlenecks: section(list(object({
    id, learnerAssumption: text, temptingMove: text, whyTempting: text,
    failureMode: z.enum(["incorrect-result", "infeasible-complexity", "unjustified-proof", "missing-representation"]),
    failureWitness: text, diagnosticQuestion: text, pivotObservationIds: nonemptyRefs,
    resolution: text,
  }))),
  transformations: section(list(object({ original: text, reformulated: text, domain: text,
    direction: z.enum(["forward", "reverse", "equivalent"]), claimIds: nonemptyRefs }))),
  observations: section(list(object({ id, proposition: text, role: z.enum(["essential", "supporting"]),
    dependsOn: refs, claimIds: nonemptyRefs }))),
  conditions: section(list(object({ predicate: text, targetProperty: text, domain: text,
    direction: z.enum(["necessary", "sufficient", "equivalent"]), claimIds: nonemptyRefs }))),
  structuralProperties: section(list(object({ kind: z.enum(["invariant", "extremal", "monovariant", "other-structure"]),
    property: text, assumptions: text, claimIds: nonemptyRefs }))),
  algorithm: section(object({ steps: list(object({ instruction: text, observationIds: nonemptyRefs })), terminationClaimId: id })),
  proof: section(object({ theorem: text, obligations: list(object({ id, claimIds: nonemptyRefs, assumptions: z.array(text).max(128),
    argument: text, resolution: z.enum(["argued", "open"]) })) })),
  complexity: section(object({ variables: text, time: text, space: text, justification: text, claimIds: nonemptyRefs })),
  implementationDifficulty: section(difficulty), discoveryDifficulty: section(difficulty), proofDifficulty: section(difficulty),
  prerequisites: section(list(object({ knowledge: text, whyNeeded: text }))),
  transferableConcepts: section(list(object({ concept: text, limits: text, observationIds: nonemptyRefs }))),
  trainingPurposes: section(list(object({ purpose: trainingPurpose, rationale: text, observationIds: nonemptyRefs }))),
  hints: section(list(object({ id, level: z.number().int().min(1).max(8), text, intendedReveal: text,
    spoiler: z.enum(["attention", "relation", "key-observation", "algorithm"]),
    observationIds: nonemptyRefs, dependsOnHintIds: refs }))),
  uncertainties: z.array(object({ scope: text, issue: text, consequence: text, neededEvidence: text })).max(128),
});

export const analysisCandidateSchema = candidateShape.superRefine((candidate, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const graph = (nodes: { id: string; dependsOn: string[] }[], label: string) => {
    const seen = new Set<string>();
    for (const node of nodes) {
      if (seen.has(node.id)) issue(`${label}: duplicate ID ${node.id}`);
      if (new Set(node.dependsOn).size !== node.dependsOn.length) issue(`${label}: duplicate dependency`);
      for (const dep of node.dependsOn) if (!seen.has(dep) || dep === node.id) issue(`${label}: dependency must reference an earlier node: ${dep}`);
      seen.add(node.id);
    }
    return seen;
  };
  const claims = graph(candidate.claims, "claims");
  const observations = graph(candidate.observations.status === "present" ? candidate.observations.content : [], "observations");
  if (candidate.discoveryBottlenecks.status === "present") {
    const bottleneckIds = candidate.discoveryBottlenecks.content.map(b => b.id);
    if (new Set(bottleneckIds).size !== bottleneckIds.length) issue("discoveryBottlenecks: duplicate ID");
    const essential = new Set(candidate.observations.status === "present"
      ? candidate.observations.content.filter(o => o.role === "essential").map(o => o.id) : []);
    for (const bottleneck of candidate.discoveryBottlenecks.content) {
      for (const pivot of bottleneck.pivotObservationIds) if (!essential.has(pivot)) issue(`discoveryBottlenecks: pivot must be essential: ${pivot}`);
    }
  }
  const checkRefs = (values: string[], allowed: Set<string>, label: string) => {
    if (new Set(values).size !== values.length) issue(`${label}: duplicate reference`);
    for (const value of values) if (!allowed.has(value)) issue(`${label}: unknown reference ${value}`);
  };
  // Recursively check typed reference fields, including proof, transformations and hints.
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "claimIds") checkRefs(child as string[], claims, key);
      else if (key === "observationIds" || key === "pivotObservationIds") checkRefs(child as string[], observations, key);
      else if (key === "terminationClaimId") checkRefs([child as string], claims, key);
      else visit(child);
    }
  };
  visit(candidate);
  if (candidate.proof.status === "present") {
    const ids = candidate.proof.content.obligations.map(o => o.id);
    if (new Set(ids).size !== ids.length) issue("proof: duplicate obligation ID");
  }
  if (candidate.hints.status === "present") {
    graph(candidate.hints.content.map(h => ({ id: h.id, dependsOn: h.dependsOnHintIds })), "hints");
    const spoilers = ["attention", "relation", "key-observation", "algorithm"];
    let lastLevel = 0; let lastSpoiler = -1;
    for (const hint of candidate.hints.content) {
      const spoiler = spoilers.indexOf(hint.spoiler);
      if (hint.level <= lastLevel || spoiler < lastSpoiler) issue("hints: levels must increase and disclosure must not regress");
      lastLevel = hint.level; lastSpoiler = spoiler;
    }
  }
  if (candidate.disposition === "complete") {
    for (const key of ["coreDiscovery", "discoveryBottlenecks", "observations", "algorithm", "proof", "complexity"] as const) {
      if (candidate[key].status !== "present") issue(`complete candidate requires ${key}`);
    }
    if (!candidate.claims.length || candidate.claims.some(c => c.gaps.length)) issue("complete candidate requires claims without declared gaps");
    if (candidate.proof.status === "present" && candidate.proof.content.obligations.some(o => o.resolution === "open")) issue("complete candidate has open proof obligations");
    if (candidate.observations.status === "present" && !candidate.observations.content.some(o => o.role === "essential")) issue("complete candidate requires an essential observation");
  }
});

/** Trusted server metadata: never part of the primary model output/input. */
export const analysisEnvelopeSchema = object({
  schemaVersion: z.literal("analysis-envelope/0.1"), analysisId: id, revision: z.number().int().positive(),
  problemKey: text, statementVersionRef: id, statementHash: hash,
  provider: text, model: text, modelRevision: text.nullable(), settings: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  promptVersion: version, promptHash: hash, contractVersion: z.literal("analysis-candidate/0.2"),
  inputHash: hash, outputHash: hash, inputPolicyVersion: version, inputPolicyPassed: z.boolean(),
  authorizationGrantRef: id, scope: z.enum(["shared", "private"]), ownerId: z.number().int().positive().nullable(),
  startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
  usageTokens: z.number().int().nonnegative().nullable(), costUsd: z.number().nonnegative().nullable(),
}).superRefine((value, ctx) => {
  if ((value.scope === "private") !== (value.ownerId !== null)) ctx.addIssue({ code: "custom", message: "private scope requires owner; shared scope forbids owner" });
  if (Date.parse(value.finishedAt) < Date.parse(value.startedAt)) ctx.addIssue({ code: "custom", message: "finish precedes start" });
});

export const verificationEvidenceSchema = object({
  schemaVersion: z.literal("verification-evidence/0.1"), evidenceId: id, analysisId: id, analysisHash: hash, statementHash: hash,
  method: z.enum(["sample", "edge", "differential", "metamorphic", "independent-critique", "human-proof-review"]),
  outcome: z.enum(["pass", "fail", "inconclusive", "unsupported"]), scope: text, claimIds: refs,
  producerRef: id, toolVersion: text, createdAt: z.string().datetime(), limitations: text,
  artifacts: z.array(object({ role: text, ref: id, sha256: hash })).max(128),
  execution: object({ runnerRef: id, environmentHash: hash, implementationHash: hash, commandArtifactRef: id,
    comparatorVersion: text, generatorVersion: text.nullable(), seed: text.nullable(), domain: text,
    caseCount: z.number().int().nonnegative(), startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
  }).nullable(),
}).superRefine((value, ctx) => {
  const executionMethod = ["sample", "edge", "differential", "metamorphic"].includes(value.method);
  if (executionMethod && ["pass", "fail"].includes(value.outcome) && (!value.execution || value.execution.caseCount < 1 || !value.artifacts.length)) {
    ctx.addIssue({ code: "custom", message: "execution outcome requires nonzero cases and artifacts" });
  }
  if (value.execution && Date.parse(value.execution.finishedAt) < Date.parse(value.execution.startedAt)) ctx.addIssue({ code: "custom", message: "execution finish precedes start" });
  if (value.execution && !value.artifacts.some(a => a.ref === value.execution!.commandArtifactRef)) ctx.addIssue({ code: "custom", message: "command artifact is missing" });
});

export const critiqueReportSchema = object({
  schemaVersion: z.literal("critique-report/0.2"), analysisId: id, analysisHash: hash, blindDerivationHash: hash,
  claimReviews: z.array(object({ claimId: id, verdict: z.enum(["supported-by-argument", "gap", "contradicted", "outside-review"]),
    scope: text, rationale: text, evidenceIds: refs })).max(128),
  bottleneckReviews: z.array(object({ bottleneckId: id,
    verdict: z.enum(["plausible", "unsupported", "incorrect", "outside-review"]),
    failureWitnessAssessment: text, pivotAssessment: text, rationale: text })).max(128),
  contradictions: z.array(object({ claimIds: nonemptyRefs, argumentOrCounterexample: text,
    reproduction: z.enum(["proposed", "executed"]), evidenceIds: refs })).max(128),
  hintReview: text, unresolvedIssues: z.array(text).max(128), requiredChecks: z.array(text).max(128),
  recommendation: z.enum(["human-review", "revise", "abstain"]),
}).superRefine((value, ctx) => {
  if (new Set(value.claimReviews.map(r => r.claimId)).size !== value.claimReviews.length) ctx.addIssue({ code: "custom", message: "duplicate claim review" });
  if (new Set(value.bottleneckReviews.map(r => r.bottleneckId)).size !== value.bottleneckReviews.length) ctx.addIssue({ code: "custom", message: "duplicate bottleneck review" });
  for (const contradiction of value.contradictions) if (contradiction.reproduction === "executed" && !contradiction.evidenceIds.length) ctx.addIssue({ code: "custom", message: "executed contradiction requires evidence references" });
});

/** This envelope does NOT authorize promotion; VERIFICATION_SPEC gates require external records. */
export const knowledgeDecisionSchema = object({
  schemaVersion: z.literal("knowledge-decision/0.1"), decisionId: id, analysisId: id, analysisHash: hash,
  status: z.enum(["unreviewed", "tested", "proof-reviewed", "disputed", "rejected"]),
  freshness: z.enum(["current", "stale", "revoked"]), actorRef: id, decidedAt: z.string().datetime(),
  evidenceIds: refs, reviewIds: refs, rationale: text, supersedesDecisionId: id.nullable(),
}).superRefine((value, ctx) => {
  if (["tested", "proof-reviewed", "rejected"].includes(value.status) && !value.evidenceIds.length) ctx.addIssue({ code: "custom", message: "decision requires evidence references" });
  if (value.status === "proof-reviewed" && !value.reviewIds.length) ctx.addIssue({ code: "custom", message: "proof-reviewed requires human review references" });
});

export const similarityProposalSchema = object({
  schemaVersion: z.literal("similarity-proposal/0.1"), leftAnalysisId: id, leftAnalysisHash: hash,
  rightAnalysisId: id, rightAnalysisHash: hash,
  relation: z.enum(["same-discovery", "partial-transfer", "surface-only", "contrast-pair"]),
  correspondences: list(object({ leftObservationIds: nonemptyRefs, rightObservationIds: nonemptyRefs, rationale: text })),
  assumptionDifferences: text, sharedDiscovery: text, reviewState: z.enum(["proposed", "accepted", "rejected"]), reviewerRef: id.nullable(),
}).superRefine((value, ctx) => {
  if (value.leftAnalysisId === value.rightAnalysisId) ctx.addIssue({ code: "custom", message: "similarity requires distinct analyses" });
  if (value.reviewState !== "proposed" && !value.reviewerRef) ctx.addIssue({ code: "custom", message: "reviewed mapping requires reviewer" });
});

export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type AnalysisCandidate = z.infer<typeof analysisCandidateSchema>;
export type VerificationEvidence = z.infer<typeof verificationEvidenceSchema>;
export type CritiqueReport = z.infer<typeof critiqueReportSchema>;
export type SimilarityProposal = z.infer<typeof similarityProposalSchema>;
