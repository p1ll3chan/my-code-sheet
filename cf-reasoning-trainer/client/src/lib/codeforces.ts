import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

export type CfProfile = {
  handle: string; rating: number | null; maxRating: number | null; historyComplete: boolean;
  lastSyncedAt: string | null; lastError: string | null; submissionCount: number;
  analytics: { acceptedFirstAttempt: number; acceptedAfterFailed: number; acceptedAfterOtherAttempt: number; attemptedUnsolved: number;
    contestSubmissions: number; practiceSubmissions: number; otherSubmissionTypes: Record<string, number>;
    ratedContestCount: number; timingDefinition: string };
  contestParticipation: { contestId: number; name: string | null; participantType: string; submissions: number;
    accepted: number; firstAcceptedFromContestStartSeconds: number | null; rated: boolean }[];
  recentSubmissions: { id: number; problemName: string; problemRating: number | null; verdict: string | null;
    participantType: string; createdAt: string; problemUrl: string | null }[];
  ratingHistory: { contestId: number; contestName: string; rank: number; oldRating: number; newRating: number; updatedAt: string }[];
};
export type Catalog = { total: number; eligible: number; unrated: number; refreshedAt: string | null; lastError: string | null;
  problems: { key: string; name: string; rating: number; solvedCount: number | null; url: string | null }[] };
export function useCfProfile(userId: number) {
  return useQuery({ queryKey: ["/api/codeforces/profile", userId], queryFn: async ({ signal }) =>
    await (await apiRequest("GET", "/api/codeforces/profile", undefined, signal)).json() as CfProfile | null });
}
export function useCatalog(userId: number) {
  return useQuery({ queryKey: ["/api/codeforces/catalog", userId], queryFn: async ({ signal }) =>
    await (await apiRequest("GET", "/api/codeforces/catalog", undefined, signal)).json() as Catalog });
}
