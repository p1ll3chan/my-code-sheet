CREATE TABLE "math_evaluation_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"stage" varchar(32) NOT NULL,
	"attempt" integer NOT NULL,
	"mode" varchar(8) NOT NULL,
	"model_id" varchar(128) NOT NULL,
	"returned_model_id" varchar(128),
	"response_id" varchar(128),
	"prompt_version" varchar(64) NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"output_hash" varchar(64),
	"output" jsonb,
	"status" varchar(24) NOT NULL,
	"error_code" varchar(48),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"reserved_micro_usd" bigint NOT NULL,
	"actual_micro_usd" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_call_limits" CHECK ("math_evaluation_calls"."attempt" between 1 and 5 and "math_evaluation_calls"."reserved_micro_usd" >= 0 and ("math_evaluation_calls"."actual_micro_usd" is null or "math_evaluation_calls"."actual_micro_usd" >= 0)),
	CONSTRAINT "evaluation_call_status" CHECK ("math_evaluation_calls"."status" in ('reserved','completed','failed','usage-unknown','invalid-output'))
);
--> statement-breakpoint
CREATE TABLE "math_evaluation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"fixture_id" varchar(128) NOT NULL,
	"arm" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"artifact_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_case_arm" CHECK ("math_evaluation_cases"."arm" in ('standard','strong','standard-critique','selective')),
	CONSTRAINT "evaluation_case_status" CHECK ("math_evaluation_cases"."status" in ('queued','running','completed','blocked'))
);
--> statement-breakpoint
CREATE TABLE "math_evaluation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"reviewer" varchar(128) NOT NULL,
	"artifact_hash" varchar(64) NOT NULL,
	"review" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_key" varchar(64) NOT NULL,
	"mode" varchar(8) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"manifest" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "math_evaluation_runs_run_key_unique" UNIQUE("run_key"),
	CONSTRAINT "evaluation_run_mode" CHECK ("math_evaluation_runs"."mode" in ('mock','live')),
	CONSTRAINT "evaluation_run_status" CHECK ("math_evaluation_runs"."status" in ('queued','running','completed','blocked'))
);
--> statement-breakpoint
ALTER TABLE "math_evaluation_calls" ADD CONSTRAINT "math_evaluation_calls_case_id_math_evaluation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."math_evaluation_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_evaluation_cases" ADD CONSTRAINT "math_evaluation_cases_run_id_math_evaluation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."math_evaluation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_evaluation_reviews" ADD CONSTRAINT "math_evaluation_reviews_case_id_math_evaluation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."math_evaluation_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_call_attempt" ON "math_evaluation_calls" USING btree ("case_id","stage","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_case_unique" ON "math_evaluation_cases" USING btree ("run_id","fixture_id","arm");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_review_identity" ON "math_evaluation_reviews" USING btree ("case_id","reviewer","artifact_hash");