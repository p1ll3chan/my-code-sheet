import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { createConfiguredReasoningModel } from "../server/reasoning/default-model";
import { createReasoningService } from "../server/reasoning/service";

const config = readConfig();
const database = createDatabase(config);
try {
  await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
  const service = createReasoningService(database.db, database.pool, config, createConfiguredReasoningModel(config));
  const [command, argument] = process.argv.slice(2);
  if (command === "register" && argument) {
    if ((await stat(argument)).size > 256_000) throw new Error("Statement file exceeds intake limit");
    const registration = JSON.parse(await readFile(argument, "utf8"));
    console.log(JSON.stringify(await service.registerStatement(registration)));
  } else if (command === "enqueue" && argument) {
    console.log(JSON.stringify(await service.enqueue(argument)));
  } else if (command === "run") {
    console.log(JSON.stringify(await service.runBatch()));
  } else if (command === "review" && argument && process.argv[4]) {
    const file = process.argv[4];
    if ((await stat(file)).size > 32_000) throw new Error("Review file exceeds limit");
    const review = JSON.parse(await readFile(file, "utf8"));
    console.log(JSON.stringify(await service.reviewProof(argument, review)));
  } else {
    throw new Error("Usage: reasoning register <approved-statement.json> | enqueue <problem-key> | run | review <analysis-id> <review.json>");
  }
} catch (error) {
  // Statement content, grants, keys and provider responses must not enter logs.
  console.error(error instanceof Error && error.message.startsWith("Usage:") ? error.message : "Reasoning command failed; inspect the permitted input, configuration and job status.");
  process.exitCode = 1;
} finally { await database.pool.end(); }
