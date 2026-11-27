import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  APP_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().url(),
  DATABASE_ID: z.string().uuid(),
  SESSION_SECRET: z.string().min(43).max(256).refine(value => !/replace|example|placeholder|change.?me/i.test(value)),
  TRUST_PROXY: z.enum(["none", "loopback"]).default("none"),
  AI_ENABLED: z.enum(["true", "false"]).default("false"),
  AI_BACKFILL_ENABLED: z.enum(["true", "false"]).default("false"),
  AI_DRY_RUN: z.enum(["true", "false"]).default("true"),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  AI_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(1),
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(20000).default(6000),
  AI_SPEND_LIMIT_USD: z.coerce.number().min(0).max(1000).default(0),
  AI_PAID_APPROVAL_ID: z.string().optional(),
  AI_APPROVED_PROBLEM_KEYS: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_STANDARD_MODEL: z.string().min(1).max(128).optional(),
  OPENAI_STRONG_MODEL: z.string().min(1).max(128).optional(),
  OPENAI_STANDARD_INPUT_USD_PER_M: z.coerce.number().min(0).max(1000).default(0),
  OPENAI_STANDARD_OUTPUT_USD_PER_M: z.coerce.number().min(0).max(1000).default(0),
  OPENAI_STRONG_INPUT_USD_PER_M: z.coerce.number().min(0).max(1000).default(0),
  OPENAI_STRONG_OUTPUT_USD_PER_M: z.coerce.number().min(0).max(1000).default(0),
});
export type Config = z.infer<typeof envSchema>;
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Never include validation input, URLs, or credential values in errors.
    throw new Error(`Invalid environment variables: ${[...new Set(result.error.issues.map(issue => issue.path[0]))].join(", ")}`);
  }
  const config = result.data;
  const origin = new URL(config.APP_ORIGIN);
  if (origin.origin !== config.APP_ORIGIN || !["http:", "https:"].includes(origin.protocol)) throw new Error("APP_ORIGIN must be an exact HTTP(S) origin");
  const database = new URL(config.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.username || !database.password || !database.pathname.slice(1) || /REPLACE_/i.test(config.DATABASE_URL)) {
    throw new Error("DATABASE_URL must identify an independent PostgreSQL database with credentials");
  }
  if (config.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("Production APP_ORIGIN requires HTTPS");
  if (config.NODE_ENV === "production" && !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && database.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("Remote production PostgreSQL requires sslmode=verify-full");
  }
  if (config.AI_ENABLED === "true" && config.AI_DRY_RUN === "false" && config.AI_PROVIDER === "openai" && (
    !config.OPENAI_API_KEY || /replace|example|placeholder/i.test(config.OPENAI_API_KEY) ||
    !config.OPENAI_STANDARD_MODEL || !config.OPENAI_STRONG_MODEL || config.AI_SPEND_LIMIT_USD <= 0 ||
    !config.AI_PAID_APPROVAL_ID || /replace|example|placeholder/i.test(config.AI_PAID_APPROVAL_ID) ||
    !config.AI_APPROVED_PROBLEM_KEYS?.trim() ||
    config.OPENAI_STANDARD_INPUT_USD_PER_M <= 0 || config.OPENAI_STANDARD_OUTPUT_USD_PER_M <= 0 ||
    config.OPENAI_STRONG_INPUT_USD_PER_M <= 0 || config.OPENAI_STRONG_OUTPUT_USD_PER_M <= 0)) {
    throw new Error("Live AI requires a server key, confirmed model IDs, explicit pricing and a positive spend limit");
  }
  return config;
}
