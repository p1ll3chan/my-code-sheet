CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"analysis_key" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"mode" varchar(8) NOT NULL,
	"tier" varchar(8) NOT NULL,
	"model_id" varchar(128) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"schema_version" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"lease_until" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" varchar(48),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_jobs_analysis_key_unique" UNIQUE("analysis_key"),
	CONSTRAINT "analysis_jobs_status_check" CHECK ("analysis_jobs"."status" in ('queued','running','completed','failed','blocked')),
	CONSTRAINT "analysis_jobs_attempts_check" CHECK ("analysis_jobs"."attempts" between 0 and "analysis_jobs"."max_attempts" and "analysis_jobs"."max_attempts" between 1 and 5),
	CONSTRAINT "analysis_jobs_mode_check" CHECK ("analysis_jobs"."mode" in ('mock','live') and "analysis_jobs"."tier" in ('standard','strong'))
);
--> statement-breakpoint
CREATE TABLE "reasoning_analysis_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"problem_key" varchar(128) NOT NULL,
	"candidate_hash" varchar(64) NOT NULL,
	"candidate" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'unreviewed' NOT NULL,
	"uncertainty" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "reasoning_analysis_versions_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "reasoning_versions_status_check" CHECK ("reasoning_analysis_versions"."status" in ('unreviewed','tested','disputed','proof-reviewed','rejected'))
);
--> statement-breakpoint
CREATE TABLE "reasoning_concept_relationships" (
	"from_id" varchar(128) NOT NULL,
	"to_id" varchar(128) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"reviewer_ref" varchar(128) NOT NULL,
	CONSTRAINT "reasoning_concept_relationships_from_id_to_id_kind_pk" PRIMARY KEY("from_id","to_id","kind"),
	CONSTRAINT "reasoning_concept_relation_check" CHECK ("reasoning_concept_relationships"."from_id" <> "reasoning_concept_relationships"."to_id" and "reasoning_concept_relationships"."kind" in ('broader','prerequisite','related'))
);
--> statement-breakpoint
CREATE TABLE "mathematical_discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"local_id" varchar(128) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"proposition" text NOT NULL,
	"details" jsonb NOT NULL,
	CONSTRAINT "math_discoveries_kind_check" CHECK ("mathematical_discoveries"."kind" in ('core','observation','bottleneck'))
);
--> statement-breakpoint
CREATE TABLE "reasoning_model_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"mode" varchar(8) NOT NULL,
	"model_id" varchar(128) NOT NULL,
	"response_id" varchar(128),
	"status" varchar(20) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"reserved_micro_usd" bigint DEFAULT 0 NOT NULL,
	"actual_micro_usd" bigint,
	"error_code" varchar(48),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "reasoning_usage_nonnegative" CHECK ("reasoning_model_usage"."reserved_micro_usd" >= 0 and ("reasoning_model_usage"."actual_micro_usd" is null or "reasoning_model_usage"."actual_micro_usd" >= 0))
);
--> statement-breakpoint
CREATE TABLE "problem_concept_relationships" (
	"problem_key" varchar(128) NOT NULL,
	"concept_id" varchar(128) NOT NULL,
	"analysis_id" uuid NOT NULL,
	"evidence_local_id" varchar(128) NOT NULL,
	"reviewer_ref" varchar(128) NOT NULL,
	CONSTRAINT "problem_concept_relationships_problem_key_concept_id_analysis_id_evidence_local_id_pk" PRIMARY KEY("problem_key","concept_id","analysis_id","evidence_local_id")
);
--> statement-breakpoint
CREATE TABLE "problem_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_key" varchar(128) NOT NULL,
	"owner_id" integer,
	"scope" varchar(16) NOT NULL,
	"locale" varchar(40) NOT NULL,
	"source_kind" varchar(32) NOT NULL,
	"source_ref" text NOT NULL,
	"grant_ref" text NOT NULL,
	"attribution" text NOT NULL,
	"processing_allowed" boolean NOT NULL,
	"sharing_allowed" boolean NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"content" jsonb NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_statements_scope_check" CHECK (("problem_statements"."scope" = 'shared' and "problem_statements"."owner_id" is null) or ("problem_statements"."scope" = 'private' and "problem_statements"."owner_id" is not null)),
	CONSTRAINT "problem_statements_sharing_check" CHECK (not "problem_statements"."sharing_allowed" or "problem_statements"."scope" = 'shared')
);
--> statement-breakpoint
CREATE TABLE "reasoning_concepts" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"facet" varchar(40) NOT NULL,
	"label" varchar(128) NOT NULL,
	"definition" text NOT NULL,
	"taxonomy_version" varchar(48) NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"reviewer_ref" varchar(128),
	CONSTRAINT "reasoning_concepts_status_check" CHECK ("reasoning_concepts"."status" in ('proposed','active','deprecated'))
);
--> statement-breakpoint
CREATE TABLE "reasoning_verification_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"method" varchar(32) NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"scope" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"actor_ref" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reasoning_verification_outcome_check" CHECK ("reasoning_verification_results"."outcome" in ('pass','fail','inconclusive','unsupported'))
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_statement_id_problem_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."problem_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_analysis_versions" ADD CONSTRAINT "reasoning_analysis_versions_job_id_analysis_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."analysis_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_analysis_versions" ADD CONSTRAINT "reasoning_analysis_versions_statement_id_problem_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."problem_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_analysis_versions" ADD CONSTRAINT "reasoning_analysis_versions_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_concept_relationships" ADD CONSTRAINT "reasoning_concept_relationships_from_id_reasoning_concepts_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."reasoning_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_concept_relationships" ADD CONSTRAINT "reasoning_concept_relationships_to_id_reasoning_concepts_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."reasoning_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mathematical_discoveries" ADD CONSTRAINT "mathematical_discoveries_analysis_id_reasoning_analysis_versions_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."reasoning_analysis_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ADD CONSTRAINT "reasoning_model_usage_job_id_analysis_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."analysis_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_concept_relationships" ADD CONSTRAINT "problem_concept_relationships_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_concept_relationships" ADD CONSTRAINT "problem_concept_relationships_concept_id_reasoning_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."reasoning_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_concept_relationships" ADD CONSTRAINT "problem_concept_relationships_analysis_id_reasoning_analysis_versions_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."reasoning_analysis_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_statements" ADD CONSTRAINT "problem_statements_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_statements" ADD CONSTRAINT "problem_statements_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_verification_results" ADD CONSTRAINT "reasoning_verification_results_analysis_id_reasoning_analysis_versions_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."reasoning_analysis_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_jobs_claim_idx" ON "analysis_jobs" USING btree ("status","next_run_at","lease_until");--> statement-breakpoint
CREATE INDEX "reasoning_versions_problem_status_idx" ON "reasoning_analysis_versions" USING btree ("problem_key","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "math_discoveries_local_idx" ON "mathematical_discoveries" USING btree ("analysis_id","kind","local_id");--> statement-breakpoint
CREATE INDEX "reasoning_usage_job_idx" ON "reasoning_model_usage" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "problem_concepts_lookup_idx" ON "problem_concept_relationships" USING btree ("concept_id","problem_key");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_statements_version_idx" ON "problem_statements" USING btree ("problem_key","content_hash","grant_ref");--> statement-breakpoint
CREATE INDEX "problem_statements_problem_idx" ON "problem_statements" USING btree ("problem_key","created_at");--> statement-breakpoint
CREATE INDEX "reasoning_concepts_facet_idx" ON "reasoning_concepts" USING btree ("facet","status");--> statement-breakpoint
CREATE INDEX "reasoning_verification_analysis_idx" ON "reasoning_verification_results" USING btree ("analysis_id","created_at");