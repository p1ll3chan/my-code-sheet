import { z } from "zod";

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/, "Use 3–32 letters, numbers or underscores");
const password = z.string().min(12, "Use at least 12 characters").max(72)
  .refine(value => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes");
export const registerSchema = z.object({
  username, password, name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();
export const loginSchema = z.object({
  username,
  password: z.string().min(1).max(72).refine(value => new TextEncoder().encode(value).length <= 72),
}).strict();
export const publicUserSchema = z.object({ id: z.number().int().positive(), username: z.string(), name: z.string() }).strict();
export const authResultSchema = z.object({ user: publicUserSchema, csrfToken: z.string() }).strict();
export const noteInputSchema = z.object({ title: z.string().trim().min(1).max(100), body: z.string().trim().max(2000) }).strict();
export const noteSchema = noteInputSchema.extend({ id: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() }).strict();
export const recordIdSchema = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).refine(value => value <= 2147483647);
export type PublicUser = z.infer<typeof publicUserSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type NoteInput = z.infer<typeof noteInputSchema>;
export type Note = z.infer<typeof noteSchema>;
