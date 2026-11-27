import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import pg from "pg";
import { readConfig } from "../server/config";
import { createDatabase } from "../server/db";
import { runMigrations } from "./migrations";
import { localCluster } from "./local-config";
import { exists, projectRoot } from "./local-postgres";

let cluster: Awaited<ReturnType<typeof localCluster>> | undefined;
try {
  const envFile = path.join(projectRoot, ".env");
  const ownerFile = path.join(projectRoot, ".local/database-owner.json");
  if (!await exists(envFile)) {
    if (await exists(ownerFile) || await exists(path.join(projectRoot, ".local/postgres"))) throw new Error("Existing local database without environment file; restore configuration instead of resetting");
    const databaseId = randomUUID();
    const password = randomBytes(32).toString("hex");
    await mkdir(path.join(projectRoot, ".local"), { recursive: true, mode: 0o700 });
    await writeFile(ownerFile, JSON.stringify({ databaseId, port: 55432 }), { flag: "wx", mode: 0o600 });
    await writeFile(envFile, ["NODE_ENV=development", "HOST=127.0.0.1", "PORT=5000", "APP_ORIGIN=http://127.0.0.1:5000", `DATABASE_URL=postgresql://cf_local:${password}@127.0.0.1:55432/cf_trainer`, `DATABASE_ID=${databaseId}`, `SESSION_SECRET=${randomBytes(48).toString("base64url")}`, "TRUST_PROXY=none", ""].join("\n"), { flag: "wx", mode: 0o600 });
  }
  const config = readConfig(parse(await readFile(envFile, "utf8")));
  cluster = await localCluster(config);
  await cluster.initialize();
  await cluster.start();
  const url = new URL(config.DATABASE_URL);
  const admin = new pg.Client({ host: "127.0.0.1", port: Number(url.port), user: "cf_local", password: decodeURIComponent(url.password), database: "postgres" });
  await admin.connect();
  try { const exists = await admin.query("select 1 from pg_database where datname = $1", ["cf_trainer"]); if (!exists.rowCount) await admin.query('create database "cf_trainer"'); } finally { await admin.end(); }
  const database = createDatabase(config);
  try { await runMigrations(database.pool, config.DATABASE_ID, true); } finally { await database.pool.end(); }
  console.log("Independent local PostgreSQL initialized and migrated. Generated credentials are in ignored .env. Run npm run dev.");
} catch (error) {
  // Messages from our validation helpers contain no credential values. Suppress
  // driver/subprocess objects, which can contain connection details.
  console.error(error instanceof Error && !('code' in error) ? error.message : "Local setup failed; check port availability and permissions");
  process.exitCode = 1;
} finally { await cluster?.stop(); }
