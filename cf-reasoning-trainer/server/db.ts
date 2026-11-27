import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./db/schema";
import type { Config } from "./config";

export function createDatabase(config: Pick<Config, "DATABASE_URL">) {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  // An idle connection failure must not terminate the process or expose a URL.
  pool.on("error", () => console.error("Database connection unavailable"));
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof createDatabase>["db"];
