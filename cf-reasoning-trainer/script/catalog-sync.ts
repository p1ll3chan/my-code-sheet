import "dotenv/config";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { CodeforcesError, createCodeforcesClient, postgresRequestGate } from "../server/codeforces/client";
import { createCatalogService } from "../server/codeforces/catalog";

const mode = process.argv[2] ?? "--sync";
if (!["--sync", "--if-stale", "--status"].includes(mode) || process.argv.length > 3) {
  console.error("Usage: npm run catalog:sync -- [--sync|--if-stale|--status]");
  process.exit(1);
}
const config = readConfig();
const database = createDatabase(config);
try {
  await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
  const catalog = createCatalogService(database.db, database.pool,
    createCodeforcesClient({ gate: postgresRequestGate(database.pool) }));
  const result = mode === "--status" ? await catalog.summary() : await catalog.refresh(mode === "--sync");
  console.log(JSON.stringify({ mode: mode.slice(2), ...result }));
} catch (error) {
  // Never print database credentials or upstream response bodies.
  const reason = error instanceof CodeforcesError ? `${error.code} (${error.status})` : "internal_error";
  console.error(`Catalog synchronization failed: ${reason}. The previous successful catalog remains available if one exists.`);
  process.exitCode = 1;
} finally { await database.pool.end(); }
