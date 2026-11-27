CREATE TABLE "training_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"problem_key" varchar(128) NOT NULL,
	"carry_from_id" integer,
	"rating" integer NOT NULL,
	"purpose" varchar(24) NOT NULL,
	"priority" integer NOT NULL,
	"planned_minutes" integer NOT NULL,
	"thinking_budget_minutes" integer NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"outcome" varchar(24),
	"independent" boolean,
	"hint_used" boolean DEFAULT false NOT NULL,
	"editorial_used" boolean DEFAULT false NOT NULL,
	"observation" varchar(2000),
	"first_observation_at" timestamp with time zone,
	"first_observation_thinking_ms" bigint,
	"thinking_ms" bigint DEFAULT 0 NOT NULL,
	"paused_ms" bigint DEFAULT 0 NOT NULL,
	"implementation_ms" bigint DEFAULT 0 NOT NULL,
	"segment_started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_assignment_rating_range" CHECK ("training_assignments"."rating" between 1200 and 2000),
	CONSTRAINT "training_assignment_budget_range" CHECK ("training_assignments"."planned_minutes" between 1 and 600 and "training_assignments"."thinking_budget_minutes" between 1 and "training_assignments"."planned_minutes"),
	CONSTRAINT "training_assignment_time_nonnegative" CHECK ("training_assignments"."thinking_ms" >= 0 and "training_assignments"."paused_ms" >= 0 and "training_assignments"."implementation_ms" >= 0),
	CONSTRAINT "training_independent_help_exclusive" CHECK (not ("training_assignments"."independent" = true and ("training_assignments"."hint_used" = true or "training_assignments"."editorial_used" = true)))
);
--> statement-breakpoint
CREATE TABLE "training_day_overrides" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"minutes" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	CONSTRAINT "training_day_overrides_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "training_override_minutes_range" CHECK ("training_day_overrides"."minutes" between 0 and 600),
	CONSTRAINT "training_override_kind_valid" CHECK ("training_day_overrides"."kind" in ('break','recovery','custom'))
);
--> statement-breakpoint
CREATE TABLE "training_days" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"capacity_minutes" integer NOT NULL,
	"band" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_days_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "training_day_capacity_range" CHECK ("training_days"."capacity_minutes" between 0 and 600),
	CONSTRAINT "training_day_band_range" CHECK ("training_days"."band" between 1200 and 2000)
);
--> statement-breakpoint
CREATE TABLE "training_goals" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"target_rating" integer NOT NULL,
	"deadline" date NOT NULL,
	"daily_minutes" integer NOT NULL,
	"training_days" jsonb NOT NULL,
	"intensity" varchar(16) NOT NULL,
	"focus" varchar(24) NOT NULL,
	"progression" varchar(16) NOT NULL,
	"time_zone" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_target_range" CHECK ("training_goals"."target_rating" between 1200 and 2000),
	CONSTRAINT "training_daily_minutes_range" CHECK ("training_goals"."daily_minutes" between 15 and 600),
	CONSTRAINT "training_intensity_valid" CHECK ("training_goals"."intensity" in ('light','standard','intense')),
	CONSTRAINT "training_focus_valid" CHECK ("training_goals"."focus" in ('growth','speed','weakness','balanced')),
	CONSTRAINT "training_progression_valid" CHECK ("training_goals"."progression" in ('strict-band','adaptive'))
);
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_carry_from_id_training_assignments_id_fk" FOREIGN KEY ("carry_from_id") REFERENCES "public"."training_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_day_overrides" ADD CONSTRAINT "training_day_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_days" ADD CONSTRAINT "training_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_goals" ADD CONSTRAINT "training_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_assignments_user_day_problem_idx" ON "training_assignments" USING btree ("user_id","day","problem_key");--> statement-breakpoint
CREATE INDEX "training_assignments_user_status_idx" ON "training_assignments" USING btree ("user_id","status","day");--> statement-breakpoint
CREATE INDEX "training_assignments_user_problem_idx" ON "training_assignments" USING btree ("user_id","problem_key","day");--> statement-breakpoint
CREATE INDEX "training_days_user_day_idx" ON "training_days" USING btree ("user_id","day");