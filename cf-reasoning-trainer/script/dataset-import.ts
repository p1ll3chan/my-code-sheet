import "dotenv/config";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { describeImportError, importDataset } from "../server/reasoning/dataset";

const usage = `dataset:import: import the pinned open-r1/codeforces dataset (Phase 4.5)

Usage:
  npm run dataset:import -- import <codeforces.jsonl> --dataset-ref <revision>
  npm run dataset:import -- --help

Reads JSONL produced by script/dataset-to-jsonl.py and checks its manifest
(<file>.manifest.json: revision must equal --dataset-ref; row count and sha256
must match the file, or nothing is committed).
Imports, in one transaction,
statements (source licensed-dataset, never served to clients), dataset metadata,
complete official tests within 8 MB, and quarantined editorials/tags. Rows that
cannot be used are skipped and counted by reason. Problems that already have an
operator-approved statement are never touched. Rerunning is idempotent.
Requires the local database to be running (npm run db:local).
Spends money: no. Network: no.`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { console.log(usage); process.exit(0); }
const [command, file] = args;
const refIndex = args.indexOf("--dataset-ref");
const datasetRef = refIndex >= 0 ? args[refIndex + 1] : undefined;
if (command !== "import" || !file || !datasetRef || !/^[0-9a-f]{40}$/.test(datasetRef)) {
  console.error(`ERROR USAGE: expected "import <file.jsonl> --dataset-ref <40-hex revision>". Fix: npm run dataset:import -- --help`);
  process.exit(2);
}
try { if (!(await stat(file)).isFile()) throw new Error("not a file"); } catch {
  console.error(`ERROR FILE_NOT_FOUND: ${file} is not a readable file. Fix: convert the parquet files first (see npm run dataset:import -- --help)`);
  process.exit(2);
}
let expectedRows: number;
let expectedSha256: string;
try {
  const manifest = JSON.parse(await readFile(`${file}.manifest.json`, "utf8")) as { revision?: unknown; rows?: unknown; sha256?: unknown };
  if (manifest.revision !== datasetRef) {
    console.error(`ERROR REVISION_MISMATCH: ${file} was converted from a different revision than --dataset-ref. Side effects: none. Fix: pass the revision in ${file}.manifest.json, or reconvert.`);
    process.exit(2);
  }
  if (!Number.isSafeInteger(manifest.rows) || typeof manifest.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(manifest.sha256)) throw new Error("bad manifest");
  expectedRows = manifest.rows as number;
  expectedSha256 = manifest.sha256;
} catch {
  console.error(`ERROR MANIFEST_MISSING: ${file}.manifest.json is missing or unreadable. Side effects: none. Fix: rerun script/dataset-to-jsonl.py, which writes it.`);
  process.exit(2);
}

const config = readConfig();
const database = createDatabase(config);
try {
  await assertDatabaseIdentity(database.pool, config.DATABASE_ID);
  const report = await importDataset(database.db, () => createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity }), datasetRef, { expectedRows, expectedSha256 });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  // Query errors embed SQL parameters (statement text); print only a code-level reason.
  const reason = describeImportError(error);
  const fix = /^(ROW_COUNT|HASH)_MISMATCH/.test(reason)
    ? "reconvert with script/dataset-to-jsonl.py so the JSONL and its manifest match"
    : "check that npm run db:local is running, then rerun the same command";
  console.error(`ERROR IMPORT_FAILED: ${reason}. Side effects: none (the transaction was rolled back). Fix: ${fix}.`);
  process.exitCode = 1;
} finally { await database.pool.end().catch(() => undefined); }
