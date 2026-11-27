import { z } from "zod";

export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date");

export const timeZone = z.string().min(1).max(64).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Enter an IANA time zone");

export const goalInput = z.object({
  targetRating: z.number().int().min(1200).max(2000),
  deadline: isoDay,
  dailyMinutes: z.number().int().min(15).max(600),
  trainingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length, "Choose each day once"),
  intensity: z.enum(["light", "standard", "intense"]),
  focus: z.enum(["growth", "speed", "weakness", "balanced"]),
  progression: z.enum(["strict-band", "adaptive"]),
  timeZone,
}).strict();
export type GoalInput = z.infer<typeof goalInput>;

export const dayOverrideInput = z.object({
  day: isoDay, minutes: z.number().int().min(0).max(600), kind: z.enum(["break", "recovery", "custom"]),
}).strict().refine(value => value.kind !== "break" || value.minutes === 0, "A break day has zero minutes");

export const trainingEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z.object({ type: z.literal("implement") }).strict(),
  z.object({ type: z.literal("observation"), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal("assist"), source: z.enum(["hint", "editorial"]) }).strict(),
  z.object({ type: z.literal("finish"), outcome: z.enum(["solved", "unsolved", "unfinished"]), independent: z.boolean() }).strict(),
]);
export type TrainingEvent = z.infer<typeof trainingEvent>;
