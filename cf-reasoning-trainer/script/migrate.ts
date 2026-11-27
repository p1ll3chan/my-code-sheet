import "dotenv/config";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { runMigrations } from "./migrations";

let database: ReturnType<typeof createDatabase> | undefined;
try {
  const config = readConfig();
  database = createDatabase(config);
  await runMigrations(database.pool, config.DATABASE_ID, process.argv.includes("--initialize"));
  console.log("Reviewed migrations applied; database identity verified.");
} catch {
  console.error("Migration failed. Check configuration, target identity and migration history. No reset was attempted.");
  process.exitCode = 1;
} finally { await database?.pool.end(); }
