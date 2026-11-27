import type { TrainingEvent } from "../../shared/training";
import type { trainingAssignments } from "../db/schema";
import { HttpError } from "../http";

export type AssignmentRow = typeof trainingAssignments.$inferSelect;
const running = new Set(["thinking", "implementing"]);
const paused = new Set(["paused_thinking", "paused_implementing"]);
function elapsed(row: AssignmentRow, now: Date): number {
  return row.segmentStartedAt ? Math.max(0, now.getTime() - row.segmentStartedAt.getTime()) : 0;
}
export function projectTimer(row: AssignmentRow, now: Date) {
  const delta = elapsed(row, now);
  return { thinkingMs: row.thinkingMs + (row.status === "thinking" ? delta : 0),
    pausedMs: row.pausedMs + (paused.has(row.status) ? delta : 0),
    implementationMs: row.implementationMs + (row.status === "implementing" ? delta : 0) };
}
export function applyTimerEvent(row: AssignmentRow, event: TrainingEvent, now: Date): Partial<AssignmentRow> {
  const state = row.status;
  if (["completed", "unfinished", "postponed", "rescheduled"].includes(state)) {
    if (event.type === "finish" && state === "completed" && row.outcome === event.outcome && row.independent === (event.outcome === "solved" && event.independent)) return {};
    throw new HttpError(409, "This assignment is closed");
  }
  if (event.type === "start") {
    if (state === "thinking") return {};
    if (state !== "pending") throw new HttpError(409, "Start is not available in this state");
    return { status: "thinking", segmentStartedAt: now };
  }
  if (event.type === "pause") {
    if (paused.has(state)) return {};
    if (!running.has(state)) throw new HttpError(409, "The timer is not running");
    const projection = projectTimer(row, now);
    return { ...projection, status: state === "thinking" ? "paused_thinking" : "paused_implementing", segmentStartedAt: now };
  }
  if (event.type === "resume") {
    if (running.has(state)) return {};
    if (!paused.has(state)) throw new HttpError(409, "The timer is not paused");
    const projection = projectTimer(row, now);
    return { ...projection, status: state === "paused_thinking" ? "thinking" : "implementing", segmentStartedAt: now };
  }
  if (event.type === "implement") {
    if (state === "implementing") return {};
    if (state !== "thinking") throw new HttpError(409, "Start thinking before implementation");
    return { ...projectTimer(row, now), status: "implementing", segmentStartedAt: now };
  }
  if (event.type === "observation") {
    if (!running.has(state) && !paused.has(state)) throw new HttpError(409, "Start the assignment before recording an observation");
    const text = row.observation ? `${row.observation}\n${event.text}` : event.text;
    if (text.length > 2000) throw new HttpError(400, "Observation limit reached");
    return { observation: text, firstObservationAt: row.firstObservationAt ?? now,
      firstObservationThinkingMs: row.firstObservationThinkingMs ?? projectTimer(row, now).thinkingMs };
  }
  if (event.type === "assist") {
    if (!running.has(state) && !paused.has(state)) throw new HttpError(409, "Start the assignment before recording assistance");
    return event.source === "hint" ? { hintUsed: true } : { editorialUsed: true };
  }
  if (event.type === "finish") {
    if (state === "pending" && event.outcome !== "unfinished") throw new HttpError(409, "Start the timer before recording an outcome");
    if (event.outcome === "solved" && event.independent && (row.hintUsed || row.editorialUsed)) throw new HttpError(400, "An assisted solve cannot be marked independent");
    const projection = projectTimer(row, now);
    return { ...projection, status: event.outcome === "unfinished" ? "unfinished" : "completed", outcome: event.outcome,
      independent: event.outcome === "solved" ? event.independent : false, segmentStartedAt: null, finishedAt: now };
  }
  throw new HttpError(400, "Unknown timer event");
}
