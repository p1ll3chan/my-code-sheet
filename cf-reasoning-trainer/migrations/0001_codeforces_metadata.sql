CREATE TABLE "cf_api_gate" (
	"id" integer PRIMARY KEY NOT NULL,
	"next_allowed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cf_api_gate_singleton" CHECK ("cf_api_gate"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "cf_catalog_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"refreshed_at" timestamp with time zone,
	"last_error" varchar(32),
	CONSTRAINT "cf_catalog_state_singleton" CHECK ("cf_catalog_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "cf_contests" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" varchar(16) NOT NULL,
	"phase" varchar(32) NOT NULL,
	"start_at" timestamp with time zone,
	"duration_seconds" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cf_contest_duration_nonnegative" CHECK ("cf_contests"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cf_problems" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"contest_id" integer,
	"problemset_name" varchar(64),
	"problem_index" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"rating" integer,
	"points" double precision,
	"solved_count" integer,
	"url" text,
	"in_problemset" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cf_problem_rating_nonnegative" CHECK ("cf_problems"."rating" IS NULL OR "cf_problems"."rating" >= 0),
	CONSTRAINT "cf_problem_solved_nonnegative" CHECK ("cf_problems"."solved_count" IS NULL OR "cf_problems"."solved_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_cf_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"handle" varchar(32) NOT NULL,
	"handle_lower" varchar(32) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"rating" integer,
	"max_rating" integer,
	"max_submission_id" bigint,
	"history_complete" boolean DEFAULT false NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_full_synced_at" timestamp with time zone,
	"last_error" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "user_cf_rating_changes" (
	"profile_id" integer NOT NULL,
	"contest_id" integer NOT NULL,
	"contest_name" text NOT NULL,
	"rank" integer NOT NULL,
	"old_rating" integer NOT NULL,
	"new_rating" integer NOT NULL,
	"rating_update_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_cf_rating_changes_profile_id_contest_id_pk" PRIMARY KEY("profile_id","contest_id")
);
--> statement-breakpoint
CREATE TABLE "user_cf_submissions" (
	"profile_id" integer NOT NULL,
	"submission_id" bigint NOT NULL,
	"problem_key" varchar(128),
	"contest_id" integer,
	"problem_contest_id" integer,
	"problemset_name" varchar(64),
	"problem_index" varchar(32) NOT NULL,
	"problem_name" text NOT NULL,
	"problem_rating" integer,
	"problem_type" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"relative_time_seconds" integer,
	"party_start_at" timestamp with time zone,
	"participant_type" varchar(32) NOT NULL,
	"verdict" varchar(40),
	"language" varchar(100) NOT NULL,
	"testset" varchar(32) NOT NULL,
	"passed_test_count" integer NOT NULL,
	"time_consumed_millis" integer NOT NULL,
	"memory_consumed_bytes" bigint NOT NULL,
	CONSTRAINT "user_cf_submissions_profile_id_submission_id_pk" PRIMARY KEY("profile_id","submission_id")
);
--> statement-breakpoint
ALTER TABLE "user_cf_profiles" ADD CONSTRAINT "user_cf_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cf_rating_changes" ADD CONSTRAINT "user_cf_rating_changes_profile_id_user_cf_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_cf_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cf_submissions" ADD CONSTRAINT "user_cf_submissions_profile_id_user_cf_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_cf_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cf_problems_training_idx" ON "cf_problems" USING btree ("in_problemset","rating","key");--> statement-breakpoint
CREATE INDEX "cf_problems_contest_idx" ON "cf_problems" USING btree ("contest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_cf_profiles_handle_idx" ON "user_cf_profiles" USING btree ("user_id","handle_lower");--> statement-breakpoint
CREATE UNIQUE INDEX "user_cf_profiles_active_idx" ON "user_cf_profiles" USING btree ("user_id") WHERE "user_cf_profiles"."active" = true;--> statement-breakpoint
CREATE INDEX "user_cf_profiles_user_idx" ON "user_cf_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_cf_rating_profile_time_idx" ON "user_cf_rating_changes" USING btree ("profile_id","rating_update_at");--> statement-breakpoint
CREATE INDEX "user_cf_submissions_time_idx" ON "user_cf_submissions" USING btree ("profile_id","submission_id");--> statement-breakpoint
CREATE INDEX "user_cf_submissions_problem_idx" ON "user_cf_submissions" USING btree ("profile_id","problem_key","created_at");--> statement-breakpoint
CREATE INDEX "user_cf_submissions_contest_idx" ON "user_cf_submissions" USING btree ("profile_id","contest_id");
--> statement-breakpoint
INSERT INTO "cf_api_gate" ("id", "next_allowed_at") VALUES (1, now());
--> statement-breakpoint
INSERT INTO "cf_catalog_state" ("id") VALUES (1);
