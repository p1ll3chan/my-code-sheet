import { mockAdapter } from "../model";
import type { Classification, Program, Solution } from "./contracts";

// Authored response fixtures, never a simulated claim about any real model.
export function packetProgram(k: number): Program {
  return { language: "bounded-json/1", instructions: [
    { op: "const", args: [1], value: 0 }, { op: "const", args: [2], value: k },
    { op: "const", args: [3], value: 1 }, { op: "length", args: [4, 0], value: null },
    { op: "lt", args: [5, 1, 4], value: null }, { op: "jz", args: [5, 13], value: null },
    { op: "get", args: [6, 0, 1], value: null }, { op: "mod", args: [7, 6, 2], value: null },
    { op: "jz", args: [7, 11], value: null }, { op: "const", args: [8], value: 0 }, { op: "return", args: [8], value: null },
    { op: "add", args: [1, 1, 3], value: null }, { op: "jump", args: [4], value: null }, { op: "return", args: [3], value: null },
  ] };
}
export function packetSolution(k: number): Solution {
  return { disposition: "complete", algorithm: `Check each pile modulo ${k}; return 1 iff every residue is zero.`,
    coreDiscovery: `Every individual pile residue modulo ${k} is invariant; divisibility of only the total does not characterize reachability.`,
    observations: [{ id: "o1", proposition: `Removal preserves each pile modulo ${k}.`, dependsOn: [] },
      { id: "o2", proposition: `A pile divisible by ${k} can be emptied by repeating the allowed operation.`, dependsOn: ["o1"] }],
    proof: `Necessity: each operation subtracts ${k} from exactly one pile, preserving all individual residues, so reaching zero requires all residues zero. Sufficiency: if a pile has size q*${k}, perform q removals. Sizes stay nonnegative and these independent constructions empty all piles. Each loop terminates because size strictly decreases. The program checks precisely these necessary and sufficient conditions.`,
    timeComplexity: "O(n) for n piles", spaceComplexity: "O(1) auxiliary space, excluding input", edgeCases: ["Zero piles are already empty.", "A total divisible by k may contain nondivisible individual piles."],
    recognition: "unknown", uncertainty: [], program: packetProgram(k) };
}
export function packetClassification(): Classification {
  const map = (concept: string, rationale: string, observationIds = ["o1"]) => ({ concept, rationale, observationIds });
  const difficulty = { level: 2, learnerBackground: "Understands divisibility and remainders.", rationale: "One conservation observation, followed by a direct construction; provisional fixture estimate." };
  return { primary: [map("invariant", "The per-pile residue, rather than the total, constrains reachability.")],
    secondary: [map("modular-conservation", "Every legal change is a multiple of k.")],
    proof: [map("invariant-preservation", "Proves the necessary condition."), map("direct", "Repeat legal removals for sufficiency.", ["o2"])],
    algorithm: [map("scan", "Test every pile's residue.")], obstacle: [map("hidden-constraint", "The total hides individual impossibility.")],
    prerequisite: [map("modular-arithmetic", "Understand unchanged remainders.")],
    skill: [map("seek-conserved-quantity", "Inspect the effect of one operation on each pile."), map("separate-necessity-sufficiency", "A residue test still needs an explicit construction.", ["o1", "o2"])],
    bottleneck: { temptingMove: "Check only whether the total is divisible by k.", whyTempting: "The final total is zero and every move changes the total by k.",
      failureWitness: "For k>=2, piles [1,k-1] have divisible total but neither admits any removal.",
      diagnosticQuestion: "Can stones in different piles ever be combined by an allowed operation?", pivotObservationIds: ["o1", "o2"],
      resolution: "Each pile has its own obstruction; zero residues then allow separate legal sequences." },
    discoveryDifficulty: difficulty, proofDifficulty: difficulty, implementationDifficulty: { ...difficulty, level: 1, rationale: "A single remainder scan." }, proposedConcepts: [] };
}
export const evaluationMock = () => mockAdapter(call => {
  if (call.outputFormat?.name === "math_classify") {
    const input = JSON.parse(call.input);
    if (input.frozenSolution.disposition === "complete") return packetClassification();
    const c = packetClassification();
    // Honest placeholders exercise transport only; disposition and uncertainty block acceptance.
    c.proposedConcepts = [{ facet: "primary", definition: "Unclassified mock placeholder", reasonExistingConceptsFail: "The mock has not solved this fixture; no classification is supported." }];
    return c;
  }
  if (call.outputFormat?.name === "math_critique") {
    const input = JSON.parse(call.input);
    return { algorithm: input.frozenSolution.disposition === "complete" ? "supported" : "unresolved",
      proof: input.frozenSolution.disposition === "complete" ? "supported" : "unresolved",
      classification: input.frozenSolution.disposition === "complete" ? "supported" : "unresolved", issues: [],
      explanation: "Authored mock critique for pipeline testing; no independent model or human review occurred." };
  }
  const input = JSON.parse(call.input);
  const match = input.statement?.match(/removes exactly ([234]) stones/);
  if (match) return packetSolution(Number(match[1]));
  return { ...packetSolution(2), disposition: "uncertain", algorithm: "No solution supplied by the mock for this fixture.",
    coreDiscovery: "Unknown; a human or approved model must derive this problem independently.",
    observations: [{ id: "o1", proposition: "The supplied problem requires analysis.", dependsOn: [] }, { id: "o2", proposition: "No mathematical conclusion has been established.", dependsOn: ["o1"] }],
    proof: "No proof supplied by this mock.", timeComplexity: "Unknown", spaceComplexity: "Unknown", edgeCases: ["Not analyzed"],
    uncertainty: ["Transport fixture only; no derived solution or educational classification."], program: null };
});
