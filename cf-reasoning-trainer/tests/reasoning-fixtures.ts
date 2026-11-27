import { mockAdapter, type ModelCall } from "../server/reasoning/model";
import { trainingKeys } from "../server/reasoning/stages";
import type { AnalysisCandidate } from "../docs/design/reasoning-contracts";
const difficulty = () => ({ status: "present" as const, reason: null, content: { level: 1, learnerBackground: "Synthetic integer identity exercise", rationale: "One direct observation, not a Codeforces difficulty estimate." } });
const unknown = () => ({ status: "unknown" as const, content: null, reason: "Not relevant to the synthetic identity task." });
export function candidate(): AnalysisCandidate {
  return { schemaVersion: "analysis-candidate/0.2", disposition: "complete", dispositionReason: "Synthetic identity task solved.",
    recognition: { status: "not-recognized", explanation: "Synthetic fixture." },
    claims: [{ id: "c1", assertion: "For each legal integer x, returning x satisfies the output condition.", assumptions: ["The output is specified as x."],
      justification: "The identity map returns exactly its argument.", dependsOn: [], gaps: [] }],
    coreDiscovery: { status: "present", reason: null, content: { explanation: "The required transformation is the identity map.", claimIds: ["c1"] } },
    initialFormulation: unknown(), naiveApproaches: unknown(),
    discoveryBottlenecks: { status: "present", reason: null, content: [{ id: "b1", learnerAssumption: "A computation is hidden.",
      temptingMove: "Search for a recurrence.", whyTempting: "Contest tasks often ask for transformations.", failureMode: "missing-representation",
      failureWitness: "The output specification already asks for x itself for every legal input.",
      diagnosticQuestion: "What changes between input and requested output?", pivotObservationIds: ["o1"],
      resolution: "Nothing changes, so returning x suffices." }] },
    transformations: unknown(), observations: { status: "present", reason: null, content: [{ id: "o1", proposition: "The requested output equals the input.",
      role: "essential", dependsOn: [], claimIds: ["c1"] }] }, conditions: unknown(), structuralProperties: unknown(),
    algorithm: { status: "present", reason: null, content: { steps: [{ instruction: "Print x.", observationIds: ["o1"] }], terminationClaimId: "c1" } },
    proof: { status: "present", reason: null, content: { theorem: "The algorithm outputs x.", obligations: [{ id: "p1", claimIds: ["c1"],
      assumptions: ["x is a legal integer."], argument: "The only step prints x.", resolution: "argued" }] } },
    complexity: { status: "present", reason: null, content: { variables: "One integer x.", time: "O(1)", space: "O(1)", justification: "One read and write.", claimIds: ["c1"] } },
    implementationDifficulty: difficulty(), discoveryDifficulty: difficulty(), proofDifficulty: difficulty(), prerequisites: unknown(),
    transferableConcepts: unknown(), trainingPurposes: { status: "present", reason: null, content: [{ purpose: "discovery", rationale: "Read the output condition before seeking a transformation.", observationIds: ["o1"] }] }, hints: unknown(), uncertainties: [] };
}

export function scriptedModel(options: { wrongSample?: boolean; contradict?: boolean; invalid?: boolean } = {}) {
  let calls = 0;
  const model = mockAdapter((call: ModelCall) => {
    calls++;
    if (options.invalid) return { invalid: true };
    if (call.role === "classification") return Object.fromEntries(Object.entries(candidate()).filter(([k]) => k in trainingKeys));
    if (call.role === "analysis" || call.role === "blind") return { ...(call.role === "analysis" ? { mathematics: Object.fromEntries(Object.entries(candidate()).filter(([k]) => !(k in trainingKeys))) } : { candidate: candidate() }),
      samplePredictions: [{ sampleIndex: 0, output: options.wrongSample ? "8\n" : "7\n" }] };
    const payload = JSON.parse(call.input) as { primary: { analysisId: string; hash: string }; blind: { hash: string } };
    return { schemaVersion: "critique-report/0.2", analysisId: payload.primary.analysisId, analysisHash: payload.primary.hash,
      blindDerivationHash: payload.blind.hash,
      claimReviews: [{ claimId: "c1", verdict: options.contradict ? "contradicted" : "supported-by-argument",
        scope: "Synthetic task.", rationale: "Fixture critique.", evidenceIds: [] }],
      bottleneckReviews: [{ bottleneckId: "b1", verdict: "plausible", failureWitnessAssessment: "Statement defines identity.",
        pivotAssessment: "Observation resolves the question.", rationale: "Synthetic only." }],
      contradictions: options.contradict ? [{ claimIds: ["c1"], argumentOrCounterexample: "Injected contradiction for transition test.",
        reproduction: "proposed", evidenceIds: [] }] : [],
      hintReview: "No hints.", unresolvedIssues: [], requiredChecks: [], recommendation: options.contradict ? "revise" : "human-review" };
  });
  return { model, calls: () => calls };
}

export const source = (problemKey: string, change = "") => ({ problemKey, locale: "en", statement: `Synthetic MIT-licensed fixture: given integer x, output x. ${change}`,
  inputSpecification: "One integer x.", outputSpecification: "Print x.", constraints: ["0 <= x <= 100"],
  examples: [{ input: "7\n", output: "7\n", explanation: null }], sampleComparison: "exact-tokens", sourceKind: "synthetic-fixture",
  sourceRef: "project-test-fixture", grantRef: `project-MIT-fixture-${change || "base"}`, attribution: "CF Reasoning Trainer synthetic test fixture (MIT)",
  approvedAt: "2026-10-15T00:00:00Z", processingAllowed: true, sharingAllowed: true, scope: "shared", ownerId: null });
