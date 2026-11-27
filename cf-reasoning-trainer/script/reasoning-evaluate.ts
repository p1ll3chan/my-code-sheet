import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { createOpenAIResponsesAdapter } from "../server/reasoning/model";
import { benchmark, manifest } from "../server/reasoning/evaluation/benchmark";
import { arms } from "../server/reasoning/evaluation/contracts";
import { evaluationMock } from "../server/reasoning/evaluation/mock";
import { createPlan } from "../server/reasoning/evaluation/plan";
import { createEvaluationService } from "../server/reasoning/evaluation/service";

// Operator CLI only; no public mutation route and no automatic live fallback.
const [command, ...args] = process.argv.slice(2);
const usage = "reasoning:evaluate manifest | plan [options.json] | create-mock [options.json] | run-mock <run-id> [1..50] | create-live <options.json> <approval.json> | run-live <run-id> [1..50] | export <run-id> <new-file.json> [blind] | review <case-id> <review.json>";
const readJson = async (file: string) => { const value = await readFile(file, "utf8"); if (Buffer.byteLength(value) > 2_000_000) throw new Error("Input file too large"); return JSON.parse(value); };
const defaults = { fixtureIds: benchmark.map(b => b.id), arms: [...arms], seed: 1729 };
if (command === "manifest" && !args.length) console.log(JSON.stringify(manifest(), null, 2));
else {
  const config = readConfig();
  const database = createDatabase(config);
  try {
    if (command === "plan" && args.length <= 1) console.log(JSON.stringify(createPlan(config, "live", args[0] ? await readJson(args[0]) : defaults), null, 2));
    else {
      await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
      const live = command === "create-live" || command === "run-live";
      const service = createEvaluationService(database.db, database.pool, config, live ? createOpenAIResponsesAdapter(config) : evaluationMock());
      if (command === "create-mock" && args.length <= 1) console.log(JSON.stringify(await service.create(args[0] ? await readJson(args[0]) : defaults)));
      else if (command === "create-live" && args.length === 2) console.log(JSON.stringify(await service.create(await readJson(args[0]), await readJson(args[1]))));
      else if ((command === "run-mock" || command === "run-live") && args.length >= 1 && args.length <= 2) console.log(JSON.stringify(await service.run(args[0], args[1] ? Number(args[1]) : config.AI_BATCH_SIZE)));
      else if (command === "export" && (args.length === 2 || args.length === 3 && args[2] === "blind")) {
        await writeFile(args[1], JSON.stringify(await service.report(args[0], args[2] === "blind"), null, 2), { flag: "wx", mode: 0o600 }); console.log("Evaluation report exported; existing files are never overwritten.");
      } else if (command === "review" && args.length === 2) console.log(JSON.stringify(await service.review(args[0], await readJson(args[1]))));
      else throw new Error(usage);
    }
  } catch { console.error(`Evaluation command failed; no automatic retry or live fallback. Usage: ${usage}`); process.exitCode = 1; }
  finally { await database.pool.end(); }
}
