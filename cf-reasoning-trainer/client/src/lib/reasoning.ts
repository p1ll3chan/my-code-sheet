import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

export type Coverage = {
  cataloged: number; eligible: number; unrated: number; lastCatalogSync: string | null; catalogError: string | null;
  authorizedStatements: number; completedAnalysis: number;
  documentedVerification: number; trainingReady: number; generatedAnalyses: number; rejectedProblems: number; failedJobs: number; historicalVersions: number;
  snapshotAt: string; otherRatedEligible: number;
  byRating: Array<{ rating: number; eligible: number; authorizedStatements: number; completedAnalysis: number; documentedVerification: number; trainingReady: number }>;
  stages: { awaitingStatement: number; ready: number; queued: number; analyzing: number;
    needsReview: number; verified: number; failed: number; blocked: number };
};
export function useReasoningCoverage(userId: number) {
  return useQuery({ queryKey: ["/api/reasoning/coverage", userId], queryFn: async ({ signal }) =>
    await (await apiRequest("GET", "/api/reasoning/coverage", undefined, signal)).json() as Coverage });
}
