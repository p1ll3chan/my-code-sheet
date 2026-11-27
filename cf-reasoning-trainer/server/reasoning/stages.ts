import { z } from "zod";
import { candidateShape, analysisCandidateSchema } from "../../docs/design/reasoning-contracts";
import { strictJsonSchema } from "./structured-output";
export const trainingKeys = { initialFormulation: true, naiveApproaches: true, discoveryBottlenecks: true,
  implementationDifficulty: true, discoveryDifficulty: true, proofDifficulty: true, prerequisites: true,
  transferableConcepts: true, trainingPurposes: true, hints: true } as const;
export const trainingStageSchema = candidateShape.pick(trainingKeys);
export const mathematicsStageSchema = z.object({ mathematics: candidateShape.omit(trainingKeys), samplePredictions: z.array(z.object({ sampleIndex: z.number().int().nonnegative(), output: z.string().max(60000) }).strict()).max(128) }).strict();
export const mathematicsJsonSchema = strictJsonSchema(mathematicsStageSchema);
export const trainingJsonSchema = strictJsonSchema(trainingStageSchema);
export const unknownTraining = () => Object.fromEntries(Object.keys(trainingKeys).map(k => [k, { status: "unknown", content: null, reason: "No supported training classification yet." }]));
export function parseMathematics(raw: unknown) {
  const parsed = mathematicsStageSchema.parse(raw);
  analysisCandidateSchema.parse({ ...parsed.mathematics, ...unknownTraining(), disposition: "partial" });
  if (parsed.mathematics.disposition === "complete" && [parsed.mathematics.coreDiscovery, parsed.mathematics.algorithm, parsed.mathematics.proof, parsed.mathematics.complexity, parsed.mathematics.observations].some(v => v.status !== "present")) throw new Error("Incomplete mathematics");
  return parsed;
}
