ALTER TABLE "dataset_problems" ADD COLUMN "statement_id" uuid;--> statement-breakpoint
ALTER TABLE "problem_test_sets" ADD COLUMN "is_current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_problems" ADD CONSTRAINT "dataset_problems_statement_id_problem_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."problem_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_problems_statement_id_idx" ON "dataset_problems" USING btree ("statement_id");--> statement-breakpoint
-- Backfill rows imported under 0007: the newest set per judgeable, unrevoked problem becomes current,
-- and each dataset problem links to its newest unrevoked licensed-dataset statement.
UPDATE "problem_test_sets" t SET "is_current" = true FROM (
  SELECT DISTINCT ON ("problem_key") "id" FROM "problem_test_sets" ORDER BY "problem_key", "created_at" DESC, "id" DESC
) latest WHERE t."id" = latest."id"
  AND NOT EXISTS (SELECT 1 FROM "dataset_problems" d WHERE d."problem_key" = t."problem_key" AND d."checker_required")
  AND NOT EXISTS (SELECT 1 FROM "problem_statements" r WHERE r."problem_key" = t."problem_key"
    AND r."source_kind" = 'licensed-dataset' AND r."revoked_at" IS NOT NULL);--> statement-breakpoint
UPDATE "dataset_problems" d SET "statement_id" = s."id" FROM (
  SELECT DISTINCT ON ("problem_key") "id", "problem_key" FROM "problem_statements"
  WHERE "source_kind" = 'licensed-dataset' AND "scope" = 'shared' AND "revoked_at" IS NULL
  ORDER BY "problem_key", "created_at" DESC
) s WHERE s."problem_key" = d."problem_key";--> statement-breakpoint
CREATE UNIQUE INDEX "problem_test_sets_current_idx" ON "problem_test_sets" USING btree ("problem_key") WHERE "problem_test_sets"."is_current";