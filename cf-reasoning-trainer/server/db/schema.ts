import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, bigint, boolean, doublePrecision, timestamp, varchar, json, jsonb, uuid, date, check, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const projectIdentity = pgTable("project_identity", {
  id: integer("id").primaryKey(), app: text("app").notNull(), instanceId: uuid("instance_id").notNull(),
}, table => [check("identity_singleton", sql`${table.id} = 1`)]);
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(), sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, withTimezone: true }).notNull(),
}, table => [index("sessions_expire_idx").on(table.expire)]);
export const notes = pgTable("training_notes", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(), body: varchar("body", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("training_notes_user_idx").on(table.userId), check("note_title_nonempty", sql`length(trim(${table.title})) > 0`)]);

// The shared Codeforces metadata is independent of any account. Tags, statements,
// editorials and source code are intentionally absent from this schema.
export const cfContests = pgTable("cf_contests", {
  id: integer("id").primaryKey(), name: text("name").notNull(),
  type: varchar("type", { length: 16 }).notNull(), phase: varchar("phase", { length: 32 }).notNull(),
  startAt: timestamp("start_at", { withTimezone: true }), durationSeconds: integer("duration_seconds").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [check("cf_contest_duration_nonnegative", sql`${table.durationSeconds} >= 0`)]);

export const cfProblems = pgTable("cf_problems", {
  key: varchar("key", { length: 128 }).primaryKey(),
  contestId: integer("contest_id"), problemsetName: varchar("problemset_name", { length: 64 }),
  index: varchar("problem_index", { length: 32 }).notNull(), name: text("name").notNull(),
  type: varchar("type", { length: 32 }).notNull(), rating: integer("rating"),
  points: doublePrecision("points"), solvedCount: integer("solved_count"),
  url: text("url"), inProblemset: boolean("in_problemset").default(false).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("cf_problems_training_idx").on(table.inProblemset, table.rating, table.key),
  index("cf_problems_contest_idx").on(table.contestId),
  check("cf_problem_rating_nonnegative", sql`${table.rating} IS NULL OR ${table.rating} >= 0`),
  check("cf_problem_solved_nonnegative", sql`${table.solvedCount} IS NULL OR ${table.solvedCount} >= 0`),
]);

export const cfCatalogState = pgTable("cf_catalog_state", {
  id: integer("id").primaryKey(), refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  lastError: varchar("last_error", { length: 32 }),
}, table => [check("cf_catalog_state_singleton", sql`${table.id} = 1`)]);

export const cfApiGate = pgTable("cf_api_gate", {
  id: integer("id").primaryKey(), nextAllowedAt: timestamp("next_allowed_at", { withTimezone: true }).notNull(),
}, table => [check("cf_api_gate_singleton", sql`${table.id} = 1`)]);

// A user may keep old public-handle imports privately while changing the active
// handle. Linking a public handle does not verify ownership of that CF account.
export const cfProfiles = pgTable("user_cf_profiles", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  handle: varchar("handle", { length: 32 }).notNull(), handleLower: varchar("handle_lower", { length: 32 }).notNull(),
  active: boolean("active").default(false).notNull(), rating: integer("rating"), maxRating: integer("max_rating"),
  maxSubmissionId: bigint("max_submission_id", { mode: "number" }), historyComplete: boolean("history_complete").default(false).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastFullSyncedAt: timestamp("last_full_synced_at", { withTimezone: true }),
  lastError: varchar("last_error", { length: 32 }),
}, table => [
  uniqueIndex("user_cf_profiles_handle_idx").on(table.userId, table.handleLower),
  uniqueIndex("user_cf_profiles_active_idx").on(table.userId).where(sql`${table.active} = true`),
  index("user_cf_profiles_user_idx").on(table.userId),
]);

export const cfRatingChanges = pgTable("user_cf_rating_changes", {
  profileId: integer("profile_id").notNull().references(() => cfProfiles.id, { onDelete: "cascade" }),
  contestId: integer("contest_id").notNull(), contestName: text("contest_name").notNull(),
  rank: integer("rank").notNull(), oldRating: integer("old_rating").notNull(), newRating: integer("new_rating").notNull(),
  updatedAt: timestamp("rating_update_at", { withTimezone: true }).notNull(),
}, table => [primaryKey({ columns: [table.profileId, table.contestId] }), index("user_cf_rating_profile_time_idx").on(table.profileId, table.updatedAt)]);

// Every public submission is retained, including repeated attempts, missing
// ratings, out-of-range ratings and verdict changes. No source-code field exists.
export const cfSubmissions = pgTable("user_cf_submissions", {
  profileId: integer("profile_id").notNull().references(() => cfProfiles.id, { onDelete: "cascade" }),
  submissionId: bigint("submission_id", { mode: "number" }).notNull(),
  problemKey: varchar("problem_key", { length: 128 }), contestId: integer("contest_id"),
  problemContestId: integer("problem_contest_id"), problemsetName: varchar("problemset_name", { length: 64 }),
  problemIndex: varchar("problem_index", { length: 32 }).notNull(), problemName: text("problem_name").notNull(),
  problemRating: integer("problem_rating"), problemType: varchar("problem_type", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  relativeTimeSeconds: integer("relative_time_seconds"), partyStartAt: timestamp("party_start_at", { withTimezone: true }),
  participantType: varchar("participant_type", { length: 32 }).notNull(),
  verdict: varchar("verdict", { length: 40 }), language: varchar("language", { length: 100 }).notNull(),
  testset: varchar("testset", { length: 32 }).notNull(), passedTestCount: integer("passed_test_count").notNull(),
  timeConsumedMillis: integer("time_consumed_millis").notNull(), memoryConsumedBytes: bigint("memory_consumed_bytes", { mode: "number" }).notNull(),
}, table => [
  primaryKey({ columns: [table.profileId, table.submissionId] }),
  index("user_cf_submissions_time_idx").on(table.profileId, table.submissionId),
  index("user_cf_submissions_problem_idx").on(table.profileId, table.problemKey, table.createdAt),
  index("user_cf_submissions_contest_idx").on(table.profileId, table.contestId),
]);

// Training goals, day overrides and activity are private to one local account.
// All time spent here is explicitly recorded by the user; CF judge timestamps
// are never used as a substitute for practice timer measurements.
export const trainingGoals = pgTable("training_goals", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  targetRating: integer("target_rating").notNull(), deadline: date("deadline", { mode: "string" }).notNull(),
  dailyMinutes: integer("daily_minutes").notNull(), trainingDays: jsonb("training_days").$type<number[]>().notNull(),
  intensity: varchar("intensity", { length: 16 }).notNull(), focus: varchar("focus", { length: 24 }).notNull(),
  progression: varchar("progression", { length: 16 }).notNull(), timeZone: varchar("time_zone", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("training_target_range", sql`${table.targetRating} between 1200 and 2000`),
  check("training_daily_minutes_range", sql`${table.dailyMinutes} between 15 and 600`),
  check("training_intensity_valid", sql`${table.intensity} in ('light','standard','intense')`),
  check("training_focus_valid", sql`${table.focus} in ('growth','speed','weakness','balanced')`),
  check("training_progression_valid", sql`${table.progression} in ('strict-band','adaptive')`),
]);

export const trainingDayOverrides = pgTable("training_day_overrides", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(), minutes: integer("minutes").notNull(),
  kind: varchar("kind", { length: 16 }).notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.day] }),
  check("training_override_minutes_range", sql`${table.minutes} between 0 and 600`),
  check("training_override_kind_valid", sql`${table.kind} in ('break','recovery','custom')`),
]);

export const trainingDays = pgTable("training_days", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  capacityMinutes: integer("capacity_minutes").notNull(), band: integer("band").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.day] }),
  index("training_days_user_day_idx").on(table.userId, table.day),
  check("training_day_capacity_range", sql`${table.capacityMinutes} between 0 and 600`),
  check("training_day_band_range", sql`${table.band} between 1200 and 2000`),
]);

export const trainingAssignments = pgTable("training_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  problemKey: varchar("problem_key", { length: 128 }).notNull().references(() => cfProblems.key),
  carryFromId: integer("carry_from_id").references((): AnyPgColumn => trainingAssignments.id),
  rating: integer("rating").notNull(), purpose: varchar("purpose", { length: 24 }).notNull(),
  priority: integer("priority").notNull(), plannedMinutes: integer("planned_minutes").notNull(),
  thinkingBudgetMinutes: integer("thinking_budget_minutes").notNull(),
  status: varchar("status", { length: 24 }).default("pending").notNull(),
  outcome: varchar("outcome", { length: 24 }), independent: boolean("independent"),
  hintUsed: boolean("hint_used").default(false).notNull(), editorialUsed: boolean("editorial_used").default(false).notNull(),
  observation: varchar("observation", { length: 2000 }), firstObservationAt: timestamp("first_observation_at", { withTimezone: true }),
  firstObservationThinkingMs: bigint("first_observation_thinking_ms", { mode: "number" }),
  thinkingMs: bigint("thinking_ms", { mode: "number" }).default(0).notNull(),
  pausedMs: bigint("paused_ms", { mode: "number" }).default(0).notNull(),
  implementationMs: bigint("implementation_ms", { mode: "number" }).default(0).notNull(),
  segmentStartedAt: timestamp("segment_started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("training_assignments_user_day_problem_idx").on(table.userId, table.day, table.problemKey),
  index("training_assignments_user_status_idx").on(table.userId, table.status, table.day),
  index("training_assignments_user_problem_idx").on(table.userId, table.problemKey, table.day),
  check("training_assignment_rating_range", sql`${table.rating} between 1200 and 2000`),
  check("training_assignment_budget_range", sql`${table.plannedMinutes} between 1 and 600 and ${table.thinkingBudgetMinutes} between 1 and ${table.plannedMinutes}`),
  check("training_assignment_time_nonnegative", sql`${table.thinkingMs} >= 0 and ${table.pausedMs} >= 0 and ${table.implementationMs} >= 0`),
  check("training_independent_help_exclusive", sql`not (${table.independent} = true and (${table.hintUsed} = true or ${table.editorialUsed} = true))`),
]);

// Phase 4B knowledge is global only when its source grant permits sharing.
// Codeforces metadata does not itself authorize statement processing.
export const problemStatements = pgTable("problem_statements", {
  id: uuid("id").primaryKey().defaultRandom(),
  problemKey: varchar("problem_key", { length: 128 }).notNull().references(() => cfProblems.key),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 16 }).notNull(), locale: varchar("locale", { length: 40 }).notNull(),
  sourceKind: varchar("source_kind", { length: 32 }).notNull(), sourceRef: text("source_ref").notNull(),
  grantRef: text("grant_ref").notNull(), attribution: text("attribution").notNull(),
  processingAllowed: boolean("processing_allowed").notNull(), sharingAllowed: boolean("sharing_allowed").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  content: jsonb("content").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("problem_statements_version_idx").on(table.problemKey, table.contentHash, table.grantRef),
  index("problem_statements_problem_idx").on(table.problemKey, table.createdAt),
  check("problem_statements_scope_check", sql`(${table.scope} = 'shared' and ${table.ownerId} is null) or (${table.scope} = 'private' and ${table.ownerId} is not null)`),
  check("problem_statements_sharing_check", sql`not ${table.sharingAllowed} or ${table.scope} = 'shared'`),
]);

// Phase 4.5: metadata imported from the pinned open-r1/codeforces dataset.
// Statement text lives in problem_statements (source_kind licensed-dataset).
export const datasetProblems = pgTable("dataset_problems", {
  problemKey: varchar("problem_key", { length: 128 }).primaryKey().references(() => cfProblems.key),
  datasetRef: text("dataset_ref").notNull(), datasetId: varchar("dataset_id", { length: 64 }).notNull(),
  split: varchar("split", { length: 16 }).notNull(),
  timeLimitMs: integer("time_limit_ms"), memoryLimitMb: integer("memory_limit_mb"),
  checkerRequired: boolean("checker_required").notNull(),
  officialTestsComplete: boolean("official_tests_complete").notNull(),
  generatedTestsCount: integer("generated_tests_count").default(0).notNull(),
  // The exact statement version this dataset revision maps to (0008).
  statementId: uuid("statement_id").references(() => problemStatements.id),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("dataset_problems_split_check", sql`${table.split} in ('train', 'test')`),
  check("dataset_problems_generated_nonnegative", sql`${table.generatedTestsCount} >= 0`),
  index("dataset_problems_statement_id_idx").on(table.statementId),
]);

// Test inputs/outputs used only by the sandboxed runner, never by analysis prompts.
export const problemTestSets = pgTable("problem_test_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  problemKey: varchar("problem_key", { length: 128 }).notNull().references(() => cfProblems.key),
  datasetRef: text("dataset_ref").notNull(), source: varchar("source", { length: 32 }).notNull(),
  complete: boolean("complete").notNull(), testCount: integer("test_count").notNull(),
  totalBytes: integer("total_bytes").notNull(), testsHash: varchar("tests_hash", { length: 64 }).notNull(),
  tests: jsonb("tests").notNull(),
  // Only the current set may be judged against; older or superseded sets stay for history (0008).
  isCurrent: boolean("is_current").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("problem_test_sets_version_idx").on(table.problemKey, table.testsHash),
  uniqueIndex("problem_test_sets_current_idx").on(table.problemKey).where(sql`${table.isCurrent}`),
  check("problem_test_sets_source_check", sql`${table.source} in ('official', 'official+generated-sample')`),
  check("problem_test_sets_count_positive", sql`${table.testCount} > 0`),
  check("problem_test_sets_size_cap", sql`${table.totalBytes} between 1 and 8388608`),
]);

// Quarantined: readable only by the evaluation module and the post-attempt
// debrief route (CEO-1). Never an analysis input (AGENTS.md).
export const problemEditorials = pgTable("problem_editorials", {
  problemKey: varchar("problem_key", { length: 128 }).primaryKey().references(() => cfProblems.key),
  datasetRef: text("dataset_ref").notNull(), editorial: text("editorial"), tags: jsonb("tags").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const datasetImportRuns = pgTable("dataset_import_runs", {
  id: uuid("id").primaryKey().defaultRandom(), datasetRef: text("dataset_ref").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(), report: jsonb("report").notNull(),
});

export const analysisBatches = pgTable("analysis_batches", {
  id: uuid("id").primaryKey().defaultRandom(), planHash: varchar("plan_hash", { length: 64 }).notNull().unique(),
  mode: varchar("mode", { length: 8 }).notNull(), status: varchar("status", { length: 24 }).default("queued").notNull(),
  plan: jsonb("plan").notNull(), approval: jsonb("approval"), budgetMicroUsd: bigint("budget_micro_usd", { mode: "number" }).notNull(),
  elapsedMs: bigint("elapsed_ms", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [check("analysis_batch_mode", sql`${t.mode} in ('mock','live')`), check("analysis_batch_budget", sql`${t.budgetMicroUsd} >= 0`)]);
export const analysisJobs = pgTable("analysis_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  statementId: uuid("statement_id").notNull().references(() => problemStatements.id),
  batchId: uuid("batch_id").references(() => analysisBatches.id), derivation: jsonb("derivation"),
  analysisKey: varchar("analysis_key", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  mode: varchar("mode", { length: 8 }).notNull(), tier: varchar("tier", { length: 8 }).notNull(),
  modelId: varchar("model_id", { length: 128 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(), promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  schemaVersion: varchar("schema_version", { length: 64 }).notNull(),
  attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow().notNull(),
  errorCode: varchar("error_code", { length: 48 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("analysis_jobs_claim_idx").on(table.status, table.nextRunAt, table.leaseUntil),
  check("analysis_jobs_status_check", sql`${table.status} in ('queued','running','completed','failed','blocked')`),
  check("analysis_jobs_attempts_check", sql`${table.attempts} between 0 and ${table.maxAttempts} and ${table.maxAttempts} between 1 and 5`),
  check("analysis_jobs_mode_check", sql`${table.mode} in ('mock','live') and ${table.tier} in ('standard','strong')`),
]);

export const analysisBatchItems = pgTable("analysis_batch_items", {
  batchId: uuid("batch_id").notNull().references(() => analysisBatches.id),
  problemKey: varchar("problem_key", { length: 128 }).notNull().references(() => cfProblems.key),
  statementId: uuid("statement_id").notNull().references(() => problemStatements.id),
  jobId: uuid("job_id").references(() => analysisJobs.id), status: varchar("status", { length: 24 }).default("pending").notNull(), errorCode: varchar("error_code", { length: 64 }),
}, t => [primaryKey({ columns: [t.batchId, t.problemKey] }), index("batch_items_job").on(t.jobId)]);

export const analysisVersions = pgTable("reasoning_analysis_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().unique().references(() => analysisJobs.id),
  statementId: uuid("statement_id").notNull().references(() => problemStatements.id),
  problemKey: varchar("problem_key", { length: 128 }).notNull().references(() => cfProblems.key),
  candidateHash: varchar("candidate_hash", { length: 64 }).notNull(),
  candidate: jsonb("candidate").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("unreviewed"),
  uncertainty: jsonb("uncertainty").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, table => [
  index("reasoning_versions_problem_status_idx").on(table.problemKey, table.status, table.createdAt),
  check("reasoning_versions_status_check", sql`${table.status} in ('unreviewed','tested','disputed','proof-reviewed','rejected')`),
]);

export const mathematicalDiscoveries = pgTable("mathematical_discoveries", {
  id: uuid("id").primaryKey().defaultRandom(), analysisId: uuid("analysis_id").notNull().references(() => analysisVersions.id, { onDelete: "cascade" }),
  localId: varchar("local_id", { length: 128 }).notNull(), kind: varchar("kind", { length: 20 }).notNull(),
  proposition: text("proposition").notNull(), details: jsonb("details").notNull(),
}, table => [uniqueIndex("math_discoveries_local_idx").on(table.analysisId, table.kind, table.localId),
  check("math_discoveries_kind_check", sql`${table.kind} in ('core','observation','bottleneck')`)]);

export const reasoningConcepts = pgTable("reasoning_concepts", {
  id: varchar("id", { length: 128 }).primaryKey(), facet: varchar("facet", { length: 40 }).notNull(),
  label: varchar("label", { length: 128 }).notNull(), definition: text("definition").notNull(),
  taxonomyVersion: varchar("taxonomy_version", { length: 48 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("proposed"),
  reviewerRef: varchar("reviewer_ref", { length: 128 }),
}, table => [index("reasoning_concepts_facet_idx").on(table.facet, table.status),
  check("reasoning_concepts_status_check", sql`${table.status} in ('proposed','active','deprecated')`)]);

export const conceptRelationships = pgTable("reasoning_concept_relationships", {
  fromId: varchar("from_id", { length: 128 }).notNull().references(() => reasoningConcepts.id),
  toId: varchar("to_id", { length: 128 }).notNull().references(() => reasoningConcepts.id),
  kind: varchar("kind", { length: 24 }).notNull(), reviewerRef: varchar("reviewer_ref", { length: 128 }).notNull(),
}, table => [primaryKey({ columns: [table.fromId, table.toId, table.kind] }),
  check("reasoning_concept_relation_check", sql`${table.fromId} <> ${table.toId} and ${table.kind} in ('broader','prerequisite','related')`)]);

export const problemConcepts = pgTable("problem_concept_relationships", {
  problemKey: varchar("problem_key", { length: 128 }).notNull().references(() => cfProblems.key),
  conceptId: varchar("concept_id", { length: 128 }).notNull().references(() => reasoningConcepts.id),
  analysisId: uuid("analysis_id").notNull().references(() => analysisVersions.id, { onDelete: "cascade" }),
  evidenceLocalId: varchar("evidence_local_id", { length: 128 }).notNull(),
  reviewerRef: varchar("reviewer_ref", { length: 128 }).notNull(),
  weight: integer("weight").notNull().default(100),
}, table => [primaryKey({ columns: [table.problemKey, table.conceptId, table.analysisId, table.evidenceLocalId] }),
  index("problem_concepts_lookup_idx").on(table.conceptId, table.problemKey),
  index("problem_concepts_analysis_idx").on(table.analysisId),
  check("problem_concepts_weight", sql`${table.weight} between 1 and 100`)]);

export const verificationResults = pgTable("reasoning_verification_results", {
  id: uuid("id").primaryKey().defaultRandom(), analysisId: uuid("analysis_id").notNull().references(() => analysisVersions.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 32 }).notNull(), outcome: varchar("outcome", { length: 20 }).notNull(),
  scope: text("scope").notNull(), evidence: jsonb("evidence").notNull(),
  actorRef: varchar("actor_ref", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("reasoning_verification_analysis_idx").on(table.analysisId, table.createdAt),
  check("reasoning_verification_outcome_check", sql`${table.outcome} in ('pass','fail','inconclusive','unsupported')`)]);

export const modelUsage = pgTable("reasoning_model_usage", {
  id: uuid("id").primaryKey().defaultRandom(), jobId: uuid("job_id").notNull().references(() => analysisJobs.id),
  role: varchar("role", { length: 16 }).notNull(), mode: varchar("mode", { length: 8 }).notNull(),
  modelId: varchar("model_id", { length: 128 }).notNull(), responseId: varchar("response_id", { length: 128 }),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(), promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  inputHash: varchar("input_hash", { length: 64 }).notNull(), outputHash: varchar("output_hash", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull(), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"),
  reservedMicroUsd: bigint("reserved_micro_usd", { mode: "number" }).notNull().default(0),
  actualMicroUsd: bigint("actual_micro_usd", { mode: "number" }),
  errorCode: varchar("error_code", { length: 48 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [index("reasoning_usage_job_idx").on(table.jobId, table.createdAt),
  check("reasoning_usage_nonnegative", sql`${table.reservedMicroUsd} >= 0 and (${table.actualMicroUsd} is null or ${table.actualMicroUsd} >= 0)`)]);

// Operator-only evaluation records. Fixtures never enter published knowledge.
export const evaluationRuns = pgTable("math_evaluation_runs", {
  id: uuid("id").primaryKey().defaultRandom(), runKey: varchar("run_key", { length: 64 }).notNull().unique(),
  mode: varchar("mode", { length: 8 }).notNull(), status: varchar("status", { length: 16 }).default("queued").notNull(),
  manifest: jsonb("manifest").notNull(), plan: jsonb("plan").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [check("evaluation_run_mode", sql`${t.mode} in ('mock','live')`),
  check("evaluation_run_status", sql`${t.status} in ('queued','running','completed','blocked')`)]);
export const evaluationCases = pgTable("math_evaluation_cases", {
  id: uuid("id").primaryKey().defaultRandom(), runId: uuid("run_id").notNull().references(() => evaluationRuns.id),
  fixtureId: varchar("fixture_id", { length: 128 }).notNull(), arm: varchar("arm", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).default("queued").notNull(), result: jsonb("result"),
  artifactHash: varchar("artifact_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("evaluation_case_unique").on(t.runId, t.fixtureId, t.arm),
  check("evaluation_case_arm", sql`${t.arm} in ('standard','strong','standard-critique','selective')`),
  check("evaluation_case_status", sql`${t.status} in ('queued','running','completed','blocked')`)]);
export const evaluationCalls = pgTable("math_evaluation_calls", {
  id: uuid("id").primaryKey().defaultRandom(), caseId: uuid("case_id").notNull().references(() => evaluationCases.id),
  stage: varchar("stage", { length: 32 }).notNull(), attempt: integer("attempt").notNull(),
  mode: varchar("mode", { length: 8 }).notNull(), modelId: varchar("model_id", { length: 128 }).notNull(),
  returnedModelId: varchar("returned_model_id", { length: 128 }), responseId: varchar("response_id", { length: 128 }),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(), promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  inputHash: varchar("input_hash", { length: 64 }).notNull(), outputHash: varchar("output_hash", { length: 64 }), output: jsonb("output"),
  status: varchar("status", { length: 24 }).notNull(), errorCode: varchar("error_code", { length: 48 }),
  inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), latencyMs: integer("latency_ms"),
  reservedMicroUsd: bigint("reserved_micro_usd", { mode: "number" }).notNull(), actualMicroUsd: bigint("actual_micro_usd", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("evaluation_call_attempt").on(t.caseId, t.stage, t.attempt),
  check("evaluation_call_limits", sql`${t.attempt} between 1 and 5 and ${t.reservedMicroUsd} >= 0 and (${t.actualMicroUsd} is null or ${t.actualMicroUsd} >= 0)`),
  check("evaluation_call_status", sql`${t.status} in ('reserved','completed','failed','usage-unknown','invalid-output')`)]);
export const evaluationReviews = pgTable("math_evaluation_reviews", {
  id: uuid("id").primaryKey().defaultRandom(), caseId: uuid("case_id").notNull().references(() => evaluationCases.id),
  reviewer: varchar("reviewer", { length: 128 }).notNull(), artifactHash: varchar("artifact_hash", { length: 64 }).notNull(),
  review: jsonb("review").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("evaluation_review_identity").on(t.caseId, t.reviewer, t.artifactHash)]);
