import type { GoalInput } from "../../shared/training";

export type Candidate = { key: string; rating: number; name: string; url: string; contestStartAt: Date | null; solvedCount: number | null };
export type PastAssignment = { id: number; problemKey: string; day: string; rating: number; status: string; outcome: string | null;
  independent: boolean | null; hintUsed: boolean; editorialUsed: boolean; plannedMinutes: number; thinkingBudgetMinutes: number;
  thinkingMs: number; implementationMs: number; pausedMs: number; observation: string | null; firstObservationAt: Date | null;
  firstObservationThinkingMs: number | null; priority: number };
export type Recommendation = { problemKey: string; rating: number; purpose: "growth" | "speed" | "weakness" | "balanced" | "resume" | "review";
  priority: number; plannedMinutes: number; thinkingBudgetMinutes: number; carryFromId: number | null };

const MINUTE = 60_000;
const DAY = 86_400_000;
export function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
}
export function weekday(day: string): number { return new Date(`${day}T00:00:00Z`).getUTCDay(); }
export function capacityForDay(goal: GoalInput, day: string, override?: { minutes: number } | null): number {
  if (day > goal.deadline) return 0;
  return override ? override.minutes : goal.trainingDays.includes(weekday(day)) ? goal.dailyMinutes : 0;
}
export function bandOf(rating: number): number { return Math.max(1200, Math.min(2000, Math.floor(rating / 100) * 100)); }

export function bandPerformance(history: PastAssignment[], baseRating: number | null, targetRating: number) {
  const byBand = new Map<number, Map<string, PastAssignment[]>>();
  for (const item of history) {
    if (!item.outcome && item.thinkingMs + item.implementationMs === 0) continue;
    const band = bandOf(item.rating);
    const group = byBand.get(band) ?? new Map<string, PastAssignment[]>();
    group.set(item.problemKey, [...(group.get(item.problemKey) ?? []), item]); byBand.set(band, group);
  }
  const stats = [...byBand.entries()].sort(([a], [b]) => a - b).map(([band, problems]) => {
    const unique = [...problems.values()];
    const wins = unique.map(attempts => ({ attempts, win: attempts.find(item => item.outcome === "solved" && item.independent === true && !item.hintUsed && !item.editorialUsed) }))
      .filter((item): item is { attempts: PastAssignment[]; win: PastAssignment } => !!item.win);
    // Earlier failed/carry time counts against speed; unused budgets on those
    // attempts do not make a later solve appear faster.
    const ratios = wins.map(({ attempts, win }) => attempts.reduce((sum, item) => sum + item.thinkingMs + item.implementationMs, 0) /
      Math.max(MINUTE, win.plannedMinutes * MINUTE)).sort((a, b) => a - b);
    const medianSpeedRatio = ratios.length ? ratios[Math.floor((ratios.length - 1) / 2)] : null;
    return { band, attempted: unique.length, independentSolved: wins.length,
      successRate: unique.length ? wins.length / unique.length : 0, medianSpeedRatio,
      readyToAdvance: wins.length >= 3 && wins.length / unique.length >= 0.7 && medianSpeedRatio !== null && medianSpeedRatio <= 0.9 };
  });
  const baseBand = Math.min(bandOf(baseRating ?? 1200), bandOf(targetRating));
  let currentBand = baseBand;
  while (currentBand < 2000 && currentBand < bandOf(targetRating) && stats.find(item => item.band === currentBand)?.readyToAdvance) currentBand += 100;
  const demonstrated = stats.some(item => item.band >= baseBand && item.attempted >= 3 && item.independentSolved >= 2);
  return { currentBand, estimatedReadiness: demonstrated ? currentBand : null, stats };
}

export function recommendDay(input: {
  goal: GoalInput; day: string; override?: { minutes: number } | null; currentRating: number | null;
  candidates: Candidate[]; history: PastAssignment[]; cfSolved: Set<string>; cfAttempted: Set<string>;
}): { capacityMinutes: number; targetMinutes: number; currentBand: number; estimatedReadiness: number | null;
  assignments: Recommendation[]; deferredKeys: string[]; reason: string | null } {
  const { goal, day, candidates, history, cfSolved, cfAttempted } = input;
  const capacityMinutes = capacityForDay(goal, day, input.override);
  const performance = bandPerformance(history, input.currentRating, goal.targetRating);
  const { currentBand, estimatedReadiness } = performance;
  const fraction = { light: 0.65, standard: 0.82, intense: 1 }[goal.intensity];
  const recent = history.filter(item => item.outcome && item.outcome !== "unfinished").sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id).slice(0, 4);
  const recentStruggling = recent.length >= 3 && recent.filter(item => item.outcome === "solved" && item.independent && !item.hintUsed && !item.editorialUsed).length < 2;
  const targetMinutes = capacityMinutes < 15 ? 0 : Math.min(capacityMinutes, Math.max(15, Math.floor(capacityMinutes * fraction * (recentStruggling ? 0.8 : 1))));
  if (!targetMinutes) return { capacityMinutes, targetMinutes, currentBand, estimatedReadiness, assignments: [], deferredKeys: [], reason: capacityMinutes === 0 ? "rest_day" : "insufficient_time" };
  const catalog = new Map(candidates.filter(item => item.rating >= 1200 && item.rating <= 2000 && !!item.url).map(item => [item.key, item]));
  const assigned = new Set<string>();
  const recentCutoff = new Date(`${day}T00:00:00Z`).getTime() - 14 * DAY;
  const recentlyAssigned = new Set(history.filter(item => Date.parse(`${item.day}T00:00:00Z`) >= recentCutoff).map(item => item.problemKey));
  const solvedTraining = new Set(history.filter(item => item.outcome === "solved").map(item => item.problemKey));
  const unresolved = history.filter(item => item.day < day && ["pending", "thinking", "paused_thinking", "implementing", "paused_implementing", "unfinished", "postponed"].includes(item.status)
    && !cfSolved.has(item.problemKey) && !solvedTraining.has(item.problemKey) && catalog.has(item.problemKey))
    .sort((a, b) => a.day.localeCompare(b.day) || a.priority - b.priority || a.id - b.id);
  // At most two previous problems can become today's essential carry work.
  // All other unfinished records remain saved but outside the active backlog.
  const deferredKeys = unresolved.slice(2).map(item => item.problemKey);
  const assignments: Recommendation[] = [];
  let remaining = targetMinutes;
  for (const item of unresolved.slice(0, 2)) {
    if (remaining < 15 || assigned.has(item.problemKey)) continue;
    const active = Math.ceil((item.thinkingMs + item.implementationMs) / MINUTE);
    const review = active >= item.plannedMinutes || item.status === "postponed";
    const desired = review ? Math.max(15, Math.min(25, Math.floor(goal.dailyMinutes * 0.25))) : Math.max(15, item.plannedMinutes - active);
    const plannedMinutes = Math.min(desired, remaining);
    if (plannedMinutes < 15) continue;
    assignments.push({ problemKey: item.problemKey, rating: catalog.get(item.problemKey)!.rating,
      purpose: review ? "review" : "resume", priority: assignments.length + 1, plannedMinutes,
      thinkingBudgetMinutes: Math.max(5, Math.min(plannedMinutes, review ? Math.ceil(plannedMinutes * 0.6) : item.thinkingBudgetMinutes - Math.floor(item.thinkingMs / MINUTE))),
      carryFromId: item.id });
    remaining -= plannedMinutes; assigned.add(item.problemKey);
  }
  const purposes: Recommendation["purpose"][] = goal.focus === "balanced" ? ["growth", "speed", "weakness"] : [goal.focus];
  while (remaining >= 15 && assignments.length < 3) {
    const purpose = purposes[assignments.length % purposes.length];
    const lower = goal.progression === "strict-band" ? currentBand : purpose === "growth" ? currentBand : Math.max(1200, currentBand - 100);
    const upper = Math.min(2000, currentBand + 99);
    const eligible = candidates.filter(item => item.rating >= lower && item.rating <= upper && !!item.url &&
      !cfSolved.has(item.key) && !solvedTraining.has(item.key) && !assigned.has(item.key) && !recentlyAssigned.has(item.key));
    if (!eligible.length) break;
    const ranked = eligible.map(item => {
      const ageDays = item.contestStartAt ? Math.max(0, Math.floor((Date.parse(`${day}T00:00:00Z`) - item.contestStartAt.getTime()) / DAY)) : 10000;
      const recency = ageDays <= 365 ? 12 : ageDays <= 730 ? 6 : 0;
      const preferredRating = purpose === "speed" ? lower : purpose === "growth" ? upper : currentBand + 30;
      const score = 30 - Math.abs(item.rating - preferredRating) / 5 + recency - (cfAttempted.has(item.key) ? purpose === "weakness" ? -4 : 12 : 0);
      return { item, score };
    }).sort((a, b) => b.score - a.score || a.item.key.localeCompare(b.item.key));
    const item = ranked[0].item;
    const desired = Math.max(15, Math.min(90, Math.round(goal.dailyMinutes * (purpose === "growth" ? 0.48 : purpose === "speed" ? 0.28 : 0.36))));
    const plannedMinutes = Math.min(desired, remaining);
    assignments.push({ problemKey: item.key, rating: item.rating, purpose,
      priority: assignments.length + 1, plannedMinutes, thinkingBudgetMinutes: Math.max(5, Math.ceil(plannedMinutes * (purpose === "speed" ? 0.55 : 0.68))), carryFromId: null });
    remaining -= plannedMinutes; assigned.add(item.key);
  }
  return { capacityMinutes, targetMinutes, currentBand, estimatedReadiness, assignments, deferredKeys,
    reason: assignments.length ? null : "no_eligible_problems" };
}
