import "dotenv/config";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { createCoverageService } from "../server/reasoning/coverage";

let limit = 50;
let after: string | undefined;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--limit" && process.argv[i + 1]) limit = Number(process.argv[++i]);
  else if (process.argv[i] === "--after" && process.argv[i + 1]) after = process.argv[++i];
  else { console.error("Usage: npm run reasoning:plan -- [--limit 1..100] [--after problem-key]"); process.exit(1); }
}
const config = readConfig();
const database = createDatabase(config);
try {
  await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
  console.log(JSON.stringify(await createCoverageService(database.pool).plan(limit, after)));
} catch {
  console.error("Dry-run plan failed; verify the migration state and arguments. No analysis was started.");
  process.exitCode = 1;
} finally { await database.pool.end(); }
