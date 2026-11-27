import { createOpenAIResponsesAdapter, mockAdapter, type ModelAdapter } from "./model";
import { trainingKeys } from "./stages";
import type { Config } from "../config";

export function createConfiguredReasoningModel(config: Config): ModelAdapter {
  if (config.AI_ENABLED === "true" && config.AI_DRY_RUN === "false" && config.AI_PROVIDER === "openai") {
    return createOpenAIResponsesAdapter(config);
  }
  // This response exercises persistence and status handling without posing as
  // mathematical analysis or using any external API.
  return mockAdapter(call => {
    if (call.role === "critique") throw new Error("Mock has no complete candidate to critique");
    const unavailable = { status: "unknown", content: null, reason: "No model inference was performed in mock mode." };
    const candidate = { schemaVersion: "analysis-candidate/0.2", disposition: "blocked", dispositionReason: "Mock mode does not derive a solution.",
      recognition: { status: "unknown", explanation: "No model call was made." }, claims: [],
      coreDiscovery: unavailable, initialFormulation: unavailable, naiveApproaches: unavailable,
      discoveryBottlenecks: unavailable, transformations: unavailable, observations: unavailable, conditions: unavailable,
      structuralProperties: unavailable, algorithm: unavailable, proof: unavailable, complexity: unavailable,
      implementationDifficulty: unavailable, discoveryDifficulty: unavailable, proofDifficulty: unavailable,
      prerequisites: unavailable, transferableConcepts: unavailable, trainingPurposes: unavailable, hints: unavailable,
      uncertainties: [{ scope: "mock", issue: "No mathematical analysis.", consequence: "Unverified candidate.", neededEvidence: "Authorized analysis and review." }] };
    const mathematics = Object.fromEntries(Object.entries(candidate).filter(([key]) => !(key in trainingKeys)));
    return call.role === "analysis" ? { mathematics, samplePredictions: [] } : { candidate, samplePredictions: [] };
  });
}
