import { useQuery } from "@tanstack/react-query";
import type { GoalInput } from "@shared/training";
import { apiRequest } from "./queryClient";

export type TrainingAssignment = { id: number; day: string; problemKey: string; name: string; url: string | null;
  rating: number; purpose: string; priority: number; plannedMinutes: number; thinkingBudgetMinutes: number;
  status: string; outcome: string | null; independent: boolean | null; hintUsed: boolean; editorialUsed: boolean;
  observation: string | null; firstObservationAt: string | null; firstObservationThinkingMs: number | null;
  thinkingMs: number; pausedMs: number; implementationMs: number; segmentStartedAt: string | null; carryFromId: number | null };
export type TrainingOverview = { serverNow: string; goal: GoalInput | null; profile: { handle: string; currentRating: number | null } | null;
  today: { day: string; capacityMinutes: number; generated: boolean; band: number; assignments: TrainingAssignment[];
    reservedMinutes: number; recordedTodayMinutes: number; overCapacity: boolean;
    override: { kind: string; minutes: number } | null } | null;
  progress: { estimatedReadiness: number | null; currentTrainingBand: number;
    bandStats: { band: number; attempted: number; independentSolved: number; successRate: number; medianSpeedRatio: number | null; readyToAdvance: boolean }[];
    daysRemaining: number; scheduledDays: number; plannedMinutes: number; availableMinutes: number; recordedMinutes: number;
    plannedWorkMinutes: number; completedWorkMinutes: number; completedAssignments: number;
    pace: number | null; assessment: "on_track" | "uncertain" | "behind"; assessmentBasis: string } | null };
export function useTrainingOverview(userId: number) {
  return useQuery({ queryKey: ["/api/training/overview", userId], queryFn: async ({ signal }) =>
    await (await apiRequest("GET", "/api/training/overview", undefined, signal)).json() as TrainingOverview });
}
