CREATE TABLE "analysis_batch_items" (
	"batch_id" uuid NOT NULL,
	"problem_key" varchar(128) NOT NULL,
	"statement_id" uuid NOT NULL,
	"job_id" uuid,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"error_code" varchar(64),
	CONSTRAINT "analysis_batch_items_batch_id_problem_key_pk" PRIMARY KEY("batch_id","problem_key")
);
--> statement-breakpoint
CREATE TABLE "analysis_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_hash" varchar(64) NOT NULL,
	"mode" varchar(8) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"plan" jsonb NOT NULL,
	"approval" jsonb,
	"budget_micro_usd" bigint NOT NULL,
	"elapsed_ms" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_batches_plan_hash_unique" UNIQUE("plan_hash"),
	CONSTRAINT "analysis_batch_mode" CHECK ("analysis_batches"."mode" in ('mock','live')),
	CONSTRAINT "analysis_batch_budget" CHECK ("analysis_batches"."budget_micro_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "derivation" jsonb;--> statement-breakpoint
ALTER TABLE "problem_concept_relationships" ADD COLUMN "weight" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_batch_id_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_statement_id_problem_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."problem_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_job_id_analysis_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."analysis_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_items_job" ON "analysis_batch_items" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_batch_id_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_concepts_analysis_idx" ON "problem_concept_relationships" USING btree ("analysis_id");--> statement-breakpoint
ALTER TABLE "problem_concept_relationships" ADD CONSTRAINT "problem_concepts_weight" CHECK ("problem_concept_relationships"."weight" between 1 and 100);