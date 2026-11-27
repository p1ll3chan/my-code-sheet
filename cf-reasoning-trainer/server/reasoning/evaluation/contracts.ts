import { z } from "zod";

const text = z.string().trim().min(1).max(12000);
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export const failureKinds = ["incorrect-discovery", "missing-observation", "invalid-proof", "incorrect-algorithm",
  "incorrect-complexity", "misleading-classification", "missing-prerequisite", "incorrect-similarity",
  "unsupported-claim", "verification-failure", "statement-ambiguity", "invalid-output", "provider-failure"] as const;
export const failureSchema = object({ kind: z.enum(failureKinds), detail: text });
export type Failure = z.infer<typeof failureSchema>;
export const instructionSchema = object({ op: z.enum(["const", "length", "get", "array", "push", "add", "sub", "mul", "div", "mod",
  "min", "max", "lt", "eq", "jump", "jz", "return"]), args: z.array(z.number().int().min(0).max(255)).max(3), value: z.number().int().safe().nullable() });
export const programSchema = object({ language: z.literal("bounded-json/1"), instructions: z.array(instructionSchema).min(1).max(256) });
export type Program = z.infer<typeof programSchema>;
export const solutionSchema = object({ disposition: z.enum(["complete", "uncertain", "blocked"]),
  algorithm: text, coreDiscovery: text,
  observations: z.array(object({ id: z.string().regex(/^o[0-9]+$/), proposition: text,
    dependsOn: z.array(z.string().regex(/^o[0-9]+$/)).max(20) })).min(1).max(20),
  proof: text, timeComplexity: text, spaceComplexity: text, edgeCases: z.array(text).min(1).max(20),
  recognition: z.enum(["not-recognized", "possibly-recognized", "recognized", "unknown"]),
  uncertainty: z.array(text).max(20), program: programSchema.nullable(),
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const o of value.observations) {
    if (seen.has(o.id) || o.dependsOn.some(id => !seen.has(id))) ctx.addIssue({ code: "custom", message: "Observation graph must be unique and topological" });
    seen.add(o.id);
  }
  if (value.disposition !== "complete" && !value.uncertainty.length) ctx.addIssue({ code: "custom", message: "Incomplete solutions need uncertainty" });
});
export type Solution = z.infer<typeof solutionSchema>;
export const vocabulary = {
  primary: ["representation-change", "invariant", "monovariant", "extremal-choice", "exchange", "feasibility-characterization", "reverse-process", "decomposition", "counting-correspondence", "symmetry", "bound-attainment", "state-sufficiency"],
  secondary: ["parity", "modular-conservation", "order-monotonicity", "local-global", "interval-structure", "independence", "cancellation", "periodicity", "pigeonhole", "connectivity"],
  proof: ["direct", "induction", "contradiction", "exchange", "invariant-preservation", "bijection", "double-counting", "case-analysis", "lower-bound-construction"],
  algorithm: ["scan", "sort", "greedy", "binary-search", "two-pointers", "prefix-aggregation", "dynamic-programming", "graph-traversal", "disjoint-set", "range-query", "enumeration", "arithmetic", "constructive"],
  obstacle: ["process-fixation", "local-choice-trap", "large-state-space", "hidden-constraint", "false-analogy", "representation-mismatch", "multiple-insights", "boundary-case"],
  prerequisite: ["parity", "modular-arithmetic", "order", "sets-counting", "graphs", "induction", "asymptotics", "recurrences", "prefix-sums"],
  skill: ["change-representation", "seek-conserved-quantity", "test-extremes", "separate-necessity-sufficiency", "construct-counterexample", "reverse-operations", "find-exchange", "compress-state", "decompose", "build-correspondence", "connect-observations"],
} as const;
const difficulty = object({ level: z.number().int().min(1).max(5), learnerBackground: text, rationale: text });
const mapping = object({ concept: text, observationIds: z.array(z.string()).min(1).max(20), rationale: text });
export const classificationSchema = object({ primary: z.array(mapping).min(1).max(2), secondary: z.array(mapping).max(12),
  proof: z.array(mapping).min(1).max(12), algorithm: z.array(mapping).min(1).max(12), obstacle: z.array(mapping).min(1).max(12),
  prerequisite: z.array(mapping).max(12), skill: z.array(mapping).min(1).max(12),
  bottleneck: object({ temptingMove: text, whyTempting: text, failureWitness: text, diagnosticQuestion: text,
    pivotObservationIds: z.array(z.string()).min(1).max(20), resolution: text }),
  discoveryDifficulty: difficulty, proofDifficulty: difficulty, implementationDifficulty: difficulty,
  proposedConcepts: z.array(object({ facet: z.enum(["primary", "secondary", "proof", "algorithm", "obstacle", "prerequisite", "skill"]), definition: text, reasonExistingConceptsFail: text })).max(8),
});
export type Classification = z.infer<typeof classificationSchema>;
export function parseClassification(raw: unknown, solution: Solution): Classification {
  const value = classificationSchema.parse(raw);
  const ids = new Set(solution.observations.map(o => o.id));
  for (const facet of Object.keys(vocabulary) as Array<keyof typeof vocabulary>) {
    for (const mapping of value[facet]) if (!(vocabulary[facet] as readonly string[]).includes(mapping.concept) || mapping.observationIds.some(id => !ids.has(id))) throw new Error("Invalid taxonomy mapping");
    if (new Set(value[facet].map(m => m.concept)).size !== value[facet].length) throw new Error("Duplicate concept");
  }
  if (value.bottleneck.pivotObservationIds.some(id => !ids.has(id))) throw new Error("Invalid pivot observation");
  return value;
}
export const critiqueSchema = object({ algorithm: z.enum(["supported", "contradicted", "unresolved"]),
  proof: z.enum(["supported", "contradicted", "unresolved"]), classification: z.enum(["supported", "contradicted", "unresolved"]),
  issues: z.array(failureSchema).max(30), explanation: text });
export type Critique = z.infer<typeof critiqueSchema>;
export const rubricKeys = ["algorithm", "proof", "primaryInsight", "secondaryObservations", "reasoningClassification", "prerequisites", "difficulty", "trainingUsefulness"] as const;
const judgment = object({ verdict: z.enum(["pass", "fail", "uncertain"]), rationale: text });
export const reviewSchema = object({ reviewer: z.string().trim().min(1).max(128), artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  rubricVersion: z.literal("math-review/1"), independent: z.literal(true),
  purpose: z.enum(["assessment", "audit"]).default("assessment"),
  judgments: object({ algorithm: judgment, proof: judgment, primaryInsight: judgment, secondaryObservations: judgment,
    reasoningClassification: judgment, prerequisites: judgment, difficulty: judgment, trainingUsefulness: judgment }),
  failures: z.array(failureSchema).max(30), notes: text });
export type Review = z.infer<typeof reviewSchema>;
export const arms = ["standard", "strong", "standard-critique", "selective"] as const;
export type Arm = typeof arms[number];
export type Evidence = { method: "sample" | "edge" | "differential"; outcome: "pass" | "fail" | "unsupported" | "inconclusive";
  cases: number; seed: number; runnerVersion: string; programHash: string | null; oracleHash: string; domain: string;
  counterexample: { input: number[]; expected: number; actual: number | null; error: string | null } | null; limitation: string };
export type EvaluationResult = { solution: Solution | null; classification: Classification | null; blind: Solution | null; critique: Critique | null;
  evidence: Evidence[]; failures: Failure[]; escalated: boolean; baseline: { solution: Solution | null; classification: Classification | null; evidence: Evidence[]; failures: Failure[] } | null;
  schemaValid: boolean; artifactHash: string; verifiedBeforeReview: boolean };
