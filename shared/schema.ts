import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("student"),
  collegeClub: text("college_club").notNull(),
  mentorId: integer("mentor_id"),
});

export const sheets = pgTable("sheets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), 
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags").array(),
  difficulty: text("difficulty"),
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

export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  problemId: integer("problem_id"),
  contestId: integer("contest_id"),
  contestProblemId: integer("contest_problem_id"),
  status: text("status").notNull(), 
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const submissionsRelations = relations(submissions, ({ one }) => ({
  user: one(users, {
    fields: [submissions.userId],
    references: [users.id],
  }),
  problem: one(problems, {
    fields: [submissions.problemId],
    references: [problems.id],
  }),
}));

export const insertSubmissionSchema = createInsertSchema(submissions).omit({ id: true, submittedAt: true });
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;

export const contests = pgTable("contests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(), // 'club', 'blitz', 'practice'
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  creatorId: integer("creator_id").notNull(),
  status: text("status").notNull().default("upcoming"),
  settings: text("settings"), // json configuration
  createdAt: timestamp("created_at").defaultNow(),
});

export const contestParticipants = pgTable("contest_participants", {
  id: serial("id").primaryKey(),
  contestId: integer("contest_id").notNull(),
  userId: integer("user_id").notNull(),
  score: integer("score").default(0),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const contestProblems = pgTable("contest_problems", {
  id: serial("id").primaryKey(),
  contestId: integer("contest_id").notNull(),
  title: text("title").notNull(),
  link: text("link").notNull(),
  platform: text("platform").notNull(),
  points: integer("points").default(100),
  order: text("order"), 
});

export const insertContestSchema = createInsertSchema(contests).omit({ id: true, createdAt: true });
export type Contest = typeof contests.$inferSelect;
export type InsertContest = z.infer<typeof insertContestSchema>;

export const insertContestParticipantSchema = createInsertSchema(contestParticipants).omit({ id: true, joinedAt: true });
export type ContestParticipant = typeof contestParticipants.$inferSelect;
export type InsertContestParticipant = z.infer<typeof insertContestParticipantSchema>;

export const insertContestProblemSchema = createInsertSchema(contestProblems).omit({ id: true });
export type ContestProblem = typeof contestProblems.$inferSelect;
export type InsertContestProblem = z.infer<typeof insertContestProblemSchema>;
