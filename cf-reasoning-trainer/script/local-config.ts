import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "../server/config";
import { managedPostgres, projectRoot } from "./local-postgres";

export async function localCluster(config: Config) {
  if (config.NODE_ENV === "production") throw new Error("Development database launcher is disabled in production");
  const marker = JSON.parse(await readFile(path.join(projectRoot, ".local/database-owner.json"), "utf8")) as { databaseId: string; port: number };
  const url = new URL(config.DATABASE_URL);
  if (marker.databaseId !== config.DATABASE_ID || url.hostname !== "127.0.0.1" || Number(url.port) !== marker.port || url.username !== "cf_local" || url.pathname !== "/cf_trainer") throw new Error("Local database identity/configuration mismatch");
  return managedPostgres({ directory: path.join(projectRoot, ".local/postgres"), port: marker.port, password: decodeURIComponent(url.password) });
}
