import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const sheets = pgTable("sheets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), 
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const problems = pgTable("problems", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull(),
  title: text("title").notNull(),
  link: text("link").notNull(),
  platform: text("platform").notNull(), 
  status: text("status").notNull().default("Not Started"),
  difficulty: text("difficulty"),
  topic: text("topic"),
  notes: text("notes"),
  solvedAt: timestamp("solved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sheetsRelations = relations(sheets, ({ one, many }) => ({
  user: one(users, {
    fields: [sheets.userId],
    references: [users.id],
  }),
  problems: many(problems),
}));

export const problemsRelations = relations(problems, ({ one }) => ({
  sheet: one(sheets, {
    fields: [problems.sheetId],
    references: [sheets.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users);
export const insertSheetSchema = createInsertSchema(sheets).omit({ id: true, userId: true, createdAt: true });
export const insertProblemSchema = createInsertSchema(problems).omit({ id: true, solvedAt: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Sheet = typeof sheets.$inferSelect;
export type InsertSheet = z.infer<typeof insertSheetSchema>;
export type Problem = typeof problems.$inferSelect;
export type InsertProblem = z.infer<typeof insertProblemSchema>;
