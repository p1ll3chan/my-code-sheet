import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { createConfiguredReasoningModel } from "../server/reasoning/default-model";
import { createReasoningService } from "../server/reasoning/service";
import { createBackfillService } from "../server/reasoning/backfill";
const config = readConfig(), database = createDatabase(config);
async function json(file?: string) { if (!file) return undefined; if ((await stat(file)).size > 100000) throw new Error("Input too large"); return JSON.parse(await readFile(file, "utf8")); }
try {
  await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
  const worker = createReasoningService(database.db, database.pool, config, createConfiguredReasoningModel(config));
  const service = createBackfillService(database.pool, config, worker);
  const [command = "plan", argument, approvalFile] = process.argv.slice(2);
  const mode = config.AI_ENABLED === "true" && config.AI_DRY_RUN === "false" && config.AI_PROVIDER === "openai" ? "live" : "mock";
  if (command === "plan") console.log(JSON.stringify(await service.plan(mode, await json(argument)), null, 2));
  else if (command === "create") console.log(JSON.stringify(await service.create(mode, await json(argument), await json(approvalFile))));
  else if (command === "run" && argument) console.log(JSON.stringify(await service.run(argument), null, 2));
  else if (command === "status" && argument) console.log(JSON.stringify(await service.status(argument), null, 2));
  else throw new Error("Invalid command");
} catch { console.error("Backfill command refused or failed. Check plan, approval, configuration and persisted status. No statement contents are logged."); process.exitCode = 1; }
finally { await database.pool.end(); }
