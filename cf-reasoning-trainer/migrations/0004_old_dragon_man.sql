ALTER TABLE "reasoning_model_usage" ADD COLUMN "prompt_version" varchar(64);--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ADD COLUMN "prompt_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ADD COLUMN "input_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ADD COLUMN "output_hash" varchar(64);--> statement-breakpoint
UPDATE "reasoning_model_usage" SET "prompt_version" = 'legacy-unrecorded', "prompt_hash" = 'legacy-unrecorded', "input_hash" = 'legacy-unrecorded' WHERE "prompt_version" IS NULL;--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ALTER COLUMN "prompt_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ALTER COLUMN "prompt_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reasoning_model_usage" ALTER COLUMN "input_hash" SET NOT NULL;
