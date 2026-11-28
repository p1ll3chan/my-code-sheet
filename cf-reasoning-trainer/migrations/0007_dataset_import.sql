CREATE TABLE "dataset_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_ref" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"report" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_problems" (
	"problem_key" varchar(128) PRIMARY KEY NOT NULL,
	"dataset_ref" text NOT NULL,
	"dataset_id" varchar(64) NOT NULL,
	"split" varchar(16) NOT NULL,
	"time_limit_ms" integer,
	"memory_limit_mb" integer,
	"checker_required" boolean NOT NULL,
	"official_tests_complete" boolean NOT NULL,
	"generated_tests_count" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_problems_split_check" CHECK ("dataset_problems"."split" in ('train', 'test')),
	CONSTRAINT "dataset_problems_generated_nonnegative" CHECK ("dataset_problems"."generated_tests_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "problem_editorials" (
	"problem_key" varchar(128) PRIMARY KEY NOT NULL,
	"dataset_ref" text NOT NULL,
	"editorial" text,
	"tags" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_test_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_key" varchar(128) NOT NULL,
	"dataset_ref" text NOT NULL,
	"source" varchar(32) NOT NULL,
	"complete" boolean NOT NULL,
	"test_count" integer NOT NULL,
	"total_bytes" integer NOT NULL,
	"tests_hash" varchar(64) NOT NULL,
	"tests" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_test_sets_source_check" CHECK ("problem_test_sets"."source" in ('official', 'official+generated-sample')),
	CONSTRAINT "problem_test_sets_count_positive" CHECK ("problem_test_sets"."test_count" > 0),
	CONSTRAINT "problem_test_sets_size_cap" CHECK ("problem_test_sets"."total_bytes" between 1 and 8388608)
);
--> statement-breakpoint
ALTER TABLE "dataset_problems" ADD CONSTRAINT "dataset_problems_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_editorials" ADD CONSTRAINT "problem_editorials_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_test_sets" ADD CONSTRAINT "problem_test_sets_problem_key_cf_problems_key_fk" FOREIGN KEY ("problem_key") REFERENCES "public"."cf_problems"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "problem_test_sets_version_idx" ON "problem_test_sets" USING btree ("problem_key","tests_hash");