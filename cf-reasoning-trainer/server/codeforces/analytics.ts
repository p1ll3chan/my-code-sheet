import type { cfContests, cfRatingChanges, cfSubmissions } from "../db/schema";
type Submission = typeof cfSubmissions.$inferSelect;
type RatingChange = typeof cfRatingChanges.$inferSelect;
type Contest = typeof cfContests.$inferSelect;

export function analyzeProfile(submissions: Submission[], ratings: RatingChange[], contests: Contest[]) {
  const byProblem = new Map<string, Submission[]>();
  const byContest = new Map<string, { contestId: number; name: string | null; participantType: string; submissions: number; accepted: number; firstAcceptedFromContestStartSeconds: number | null; rated: boolean }>();
  const contestMap = new Map(contests.map(contest => [contest.id, contest]));
  const ratedMap = new Map(ratings.map(change => [change.contestId, change]));
  const submissionTypes: Record<string, number> = {};
  for (const submission of submissions) {
    const key = submission.problemKey ?? `unknown:${submission.submissionId}`;
    const group = byProblem.get(key) ?? [];
    group.push(submission); byProblem.set(key, group);
    submissionTypes[submission.participantType] = (submissionTypes[submission.participantType] ?? 0) + 1;
    if (submission.contestId !== null) {
      const key = `${submission.contestId}:${submission.participantType}`;
      const contest = contestMap.get(submission.contestId);
      const existing = byContest.get(key) ?? { contestId: submission.contestId, name: contest?.name ?? null,
        participantType: submission.participantType, submissions: 0, accepted: 0,
        firstAcceptedFromContestStartSeconds: null, rated: ratedMap.has(submission.contestId) };
      existing.submissions++;
      if (submission.verdict === "OK") {
        existing.accepted++;
        const officialStart = contest?.startAt ?? (submission.participantType === "CONTESTANT" ? submission.partyStartAt : null);
        const elapsed = officialStart && submission.participantType === "CONTESTANT"
          ? Math.floor((submission.createdAt.getTime() - officialStart.getTime()) / 1000) : null;
        if (elapsed !== null && elapsed >= 0 && (contest === undefined || elapsed <= contest.durationSeconds) &&
          (existing.firstAcceptedFromContestStartSeconds === null || elapsed < existing.firstAcceptedFromContestStartSeconds))
          existing.firstAcceptedFromContestStartSeconds = elapsed;
      }
      byContest.set(key, existing);
    }
  }
  for (const rating of ratings) {
    const key = `${rating.contestId}:CONTESTANT`;
    if (!byContest.has(key)) byContest.set(key, { contestId: rating.contestId,
      name: contestMap.get(rating.contestId)?.name ?? rating.contestName, participantType: "CONTESTANT",
      submissions: 0, accepted: 0, firstAcceptedFromContestStartSeconds: null, rated: true });
  }
  let acceptedFirstAttempt = 0, acceptedAfterFailed = 0, acceptedAfterOtherAttempt = 0, attemptedUnsolved = 0;
  for (const group of byProblem.values()) {
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.submissionId - b.submissionId);
    const firstAcceptedIndex = group.findIndex(item => item.verdict === "OK");
    if (firstAcceptedIndex === -1) attemptedUnsolved++;
    else if (firstAcceptedIndex === 0) acceptedFirstAttempt++;
    else if (group.slice(0, firstAcceptedIndex).some(item => item.verdict && !["OK", "TESTING", "SKIPPED"].includes(item.verdict))) acceptedAfterFailed++;
    else acceptedAfterOtherAttempt++;
  }
  return { analytics: { acceptedFirstAttempt, acceptedAfterFailed, acceptedAfterOtherAttempt, attemptedUnsolved,
    contestSubmissions: submissionTypes.CONTESTANT ?? 0, practiceSubmissions: submissionTypes.PRACTICE ?? 0,
    otherSubmissionTypes: Object.fromEntries(Object.entries(submissionTypes).filter(([type]) => type !== "CONTESTANT" && type !== "PRACTICE")),
    ratedContestCount: ratings.length,
    timingDefinition: "Seconds from official contest start to first accepted submission; not problem thinking time. Accepted submissions do not prove independent solving." },
    contestParticipation: [...byContest.values()].sort((a, b) => b.contestId - a.contestId) };
}
