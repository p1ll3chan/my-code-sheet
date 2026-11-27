import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db";
import { notes } from "../db/schema";
import type { NoteInput } from "../../shared/contracts";

const columns = { id: notes.id, title: notes.title, body: notes.body, createdAt: notes.createdAt, updatedAt: notes.updatedAt };
export function createNotesService(db: Database) {
  const owned = (userId: number, id: number) => and(eq(notes.userId, userId), eq(notes.id, id));
  return {
    list: (userId: number) => db.select(columns).from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.id)).limit(100),
    async get(userId: number, id: number) { return (await db.select(columns).from(notes).where(owned(userId, id)))[0]; },
    async create(userId: number, input: NoteInput) {
      return (await db.insert(notes).values({ userId, title: input.title, body: input.body }).returning(columns))[0];
    },
    async update(userId: number, id: number, input: NoteInput) {
      return (await db.update(notes).set({ title: input.title, body: input.body, updatedAt: new Date() }).where(owned(userId, id)).returning(columns))[0];
    },
    async delete(userId: number, id: number) { return (await db.delete(notes).where(owned(userId, id)).returning({ id: notes.id }))[0]; },
  };
}
export type NotesService = ReturnType<typeof createNotesService>;
