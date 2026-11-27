import { randomBytes, randomUUID } from "node:crypto";
import { createServer as createTcpServer } from "node:net";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, realpath } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { managedPostgres, projectRoot } from "../script/local-postgres";
import { runMigrations } from "../script/migrations";
import { createDatabase } from "../server/db";
import { readConfig, type Config } from "../server/config";
import { createApp, type LogEvent } from "../server/app";
import type { CodeforcesClient } from "../server/codeforces/client";

export async function freePort() {
  const server = createTcpServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
export async function testDatabase() {
  const root = path.join(projectRoot, ".test-data");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "pg-"));
  const password = randomBytes(32).toString("hex");
  const port = await freePort();
  const cluster = await managedPostgres({ directory, port, password });
  await cluster.initialize();
  try { await cluster.start(); } catch (error) { await cluster.stop(); throw error; }
  const admin = new pg.Client({ host: "127.0.0.1", port, user: "cf_local", password, database: "postgres" });
  await admin.connect();
  try { await admin.query("create database cf_test"); } finally { await admin.end(); }
  const config = readConfig({ NODE_ENV: "test", APP_ORIGIN: "http://127.0.0.1:5000", DATABASE_URL: `postgresql://cf_local:${password}@127.0.0.1:${port}/cf_test`, DATABASE_ID: randomUUID(), SESSION_SECRET: randomBytes(48).toString("base64url") });
  const database = createDatabase(config);
  await runMigrations(database.pool, config.DATABASE_ID, true);
  return { config, database, async close() {
    await database.pool.end(); await cluster.stop();
    const resolved = await realpath(directory);
    if (resolved !== path.resolve(directory) || !resolved.startsWith(path.resolve(root) + path.sep)) throw new Error("Unsafe test cleanup target");
    await rm(resolved, { recursive: true });
  } };
}
export async function testApi(config: Config, database: ReturnType<typeof createDatabase>, cfClient?: CodeforcesClient) {
  const logs: LogEvent[] = [];
  const { app, close } = await createApp(config, database, event => logs.push(event), cfClient);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { base, logs, async close() { await new Promise<void>(resolve => server.close(() => resolve())); close(); } };
}
export class Browser {
  cookie = "";
  csrf = "";
  constructor(public base: string, public origin: string) {}
  async request(method: string, route: string, body?: unknown, overrides: Record<string, string | null | undefined> = {}) {
    const headers: Record<string, string> = { Cookie: this.cookie };
    if (method !== "GET") Object.assign(headers, { Origin: this.origin, "Content-Type": "application/json", "X-CSRF-Token": this.csrf });
    for (const [key, value] of Object.entries(overrides)) { if (value == null) delete headers[key]; else headers[key] = value; }
    const response = await fetch(this.base + route, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
    const cookies = response.headers.getSetCookie();
    for (const cookie of cookies) this.cookie = cookie.split(";")[0];
    const text = await response.text();
    const data = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : undefined;
    if (data?.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, headers: response.headers, cookies, text, data };
  }
  async prepare() { return this.request("GET", "/api/csrf"); }
  async register() {
    await this.prepare();
    const username = `user_${randomBytes(8).toString("hex")}`;
    const input = { username, name: "Synthetic User", email: `${username}@example.invalid`, password: randomBytes(24).toString("hex") };
    const response = await this.request("POST", "/api/register", input);
    return { input, response };
  }
}
