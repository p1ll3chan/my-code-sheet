import { z } from "zod";

const positiveId = z.number().int().safe().positive();
const seconds = z.number().int().safe().nonnegative();
export const cfHandleSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]{3,32}$/, "Enter a valid Codeforces handle");
export const cfProblemSchema = z.object({
  contestId: positiveId.optional(), problemsetName: z.string().min(1).max(64).optional(),
  index: z.string().min(1).max(32), name: z.string().min(1), type: z.string().min(1).max(32),
  points: z.number().finite().optional(), rating: z.number().int().nonnegative().optional(),
});
export const cfProblemStatisticSchema = z.object({ contestId: positiveId.optional(), problemsetName: z.string().min(1).max(64).optional(), index: z.string().min(1).max(32), solvedCount: z.number().int().nonnegative() });
export const cfContestSchema = z.object({
  id: positiveId, name: z.string().min(1), type: z.string().min(1).max(16), phase: z.string().min(1).max(32),
  durationSeconds: seconds, startTimeSeconds: seconds.optional(),
});
export const cfUserSchema = z.object({ handle: cfHandleSchema, rating: z.number().int().optional(), maxRating: z.number().int().optional() });
export const cfRatingChangeSchema = z.object({
  contestId: positiveId, contestName: z.string().min(1), handle: cfHandleSchema, rank: z.number().int(),
  ratingUpdateTimeSeconds: seconds, oldRating: z.number().int(), newRating: z.number().int(),
});
export const cfSubmissionSchema = z.object({
  id: positiveId, contestId: positiveId.optional(), creationTimeSeconds: seconds, relativeTimeSeconds: z.number().int().safe().optional(),
  problem: cfProblemSchema,
  author: z.object({ contestId: positiveId.optional(), participantType: z.string().min(1).max(32), startTimeSeconds: seconds.optional() }),
  programmingLanguage: z.string().max(100), verdict: z.string().min(1).max(40).optional(),
  testset: z.string().max(32), passedTestCount: z.number().int().nonnegative(),
  timeConsumedMillis: z.number().int().nonnegative(), memoryConsumedBytes: z.number().int().safe().nonnegative(),
});
export const cfProblemsetSchema = z.object({ problems: cfProblemSchema.array(), problemStatistics: cfProblemStatisticSchema.array() });

export type CfProblem = z.infer<typeof cfProblemSchema>;
export type CfContest = z.infer<typeof cfContestSchema>;
export type CfUser = z.infer<typeof cfUserSchema>;
export type CfRatingChange = z.infer<typeof cfRatingChangeSchema>;
export type CfSubmission = z.infer<typeof cfSubmissionSchema>;

export function problemKey(problem: Pick<CfProblem, "contestId" | "problemsetName" | "index">): string | null {
  if (problem.contestId) return `c:${problem.contestId}:${problem.index}`;
  if (problem.problemsetName) return `s:${problem.problemsetName.toLowerCase()}:${problem.index}`;
  return null;
}
export function problemUrl(problem: Pick<CfProblem, "contestId" | "index">): string | null {
  return problem.contestId ? `https://codeforces.com/problemset/problem/${problem.contestId}/${encodeURIComponent(problem.index)}` : null;
}
export function atSeconds(value: number | undefined) { return value === undefined ? null : new Date(value * 1000); }
export function trainingEligible(rating: number | null | undefined) { return rating !== null && rating !== undefined && rating >= 1200 && rating <= 2000; }
