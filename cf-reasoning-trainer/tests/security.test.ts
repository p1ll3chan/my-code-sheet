import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Browser, testApi, testDatabase } from "./helpers";
import { runMigrations } from "../script/migrations";
import { createDatabase } from "../server/db";
import { assertDatabaseIdentity } from "../server/db/identity";
import { SESSION_MAX_AGE_MS } from "../server/config";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let api: Awaited<ReturnType<typeof testApi>>;
let browser: Browser;
before(async () => { fixture = await testDatabase(); });
after(async () => { await fixture?.close(); });
beforeEach(async () => { api = await testApi(fixture.config, fixture.database); browser = new Browser(api.base, fixture.config.APP_ORIGIN); });
afterEach(async () => { await api?.close(); });

test("registration exposes only public fields, hashes passwords, and rotates the anonymous session", async () => {
  const anonymous = await browser.prepare();
  const oldCookie = browser.cookie;
  const oldCsrf = browser.csrf;
  const { input, response } = await browser.register();
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(response.data.user).sort(), ["id", "name", "username"]);
  assert.notEqual(browser.cookie, oldCookie);
  assert.notEqual(browser.csrf, oldCsrf);
  assert.match(anonymous.cookies[0], /HttpOnly/);
  assert.match(response.cookies[0], /SameSite=Lax/);
  assert.match(response.cookies[0], /Path=\//);
  const current = await browser.request("GET", "/api/user");
  assert.equal(current.status, 200);
  assert.equal(current.headers.get("cache-control"), "no-store");
  assert.deepEqual(current.data, response.data.user);
  const stored = await fixture.database.pool.query("select password_hash from users where id = $1", [response.data.user.id]);
  assert.match(stored.rows[0].password_hash, /^\$2[aby]\$12\$/);
  assert.equal(response.text.includes(input.password), false);
  assert.equal(response.text.includes(stored.rows[0].password_hash), false);
  assert.equal(response.text.includes(input.email), false);
  assert.equal((await browser.request("GET", "/api/user", undefined, { Cookie: oldCookie })).status, 401);
  assert.equal((await browser.request("POST", "/api/notes", { title: "x", body: "" }, { "X-CSRF-Token": oldCsrf })).status, 403);
});

test("login validates credentials, rotates sessions, rejects tampering; logout revokes the old cookie", async () => {
  const { input } = await browser.register();
  const beforeLogout = browser.cookie;
  assert.equal((await browser.request("POST", "/api/logout")).status, 204);
  assert.equal((await browser.request("GET", "/api/user", undefined, { Cookie: beforeLogout })).status, 401);
  await browser.prepare();
  const anonymousCookie = browser.cookie;
  assert.equal((await browser.request("POST", "/api/login", { username: input.username, password: "incorrect-password" })).status, 401);
  assert.equal((await browser.request("POST", "/api/login", { username: "missing_account", password: input.password })).status, 401);
  const login = await browser.request("POST", "/api/login", { username: input.username.toUpperCase(), password: input.password });
  assert.equal(login.status, 200);
  assert.notEqual(browser.cookie, anonymousCookie);
  assert.deepEqual(Object.keys(login.data.user).sort(), ["id", "name", "username"]);
  assert.equal((await browser.request("GET", "/api/user", undefined, { Cookie: browser.cookie + "tampered" })).status, 401);
  const signedCookie = browser.cookie;
  const logout = await browser.request("POST", "/api/logout");
  assert.equal(logout.status, 204);
  assert.match(logout.cookies[0], /Expires=Thu, 01 Jan 1970/);
  assert.equal((await browser.request("GET", "/api/user", undefined, { Cookie: signedCookie })).status, 401);
});

test("two accounts cannot read, update, delete or reassign each other's private notes", async () => {
  const owner = await browser.register();
  const created = await browser.request("POST", "/api/notes", { title: "Private reasoning", body: "Only the owner should see this." });
  assert.equal(created.status, 201);
  const id = created.data.id;
  const other = new Browser(api.base, fixture.config.APP_ORIGIN);
  const second = await other.register();
  assert.equal(second.response.status, 201);
  assert.deepEqual((await other.request("GET", "/api/notes")).data, []);
  assert.deepEqual((await other.request("GET", `/api/notes?userId=${owner.response.data.user.id}`)).data, []);
  assert.equal((await other.request("GET", `/api/notes/${id}`)).status, 404);
  assert.equal((await other.request("PUT", `/api/notes/${id}`, { title: "Stolen", body: "" })).status, 404);
  assert.equal((await other.request("DELETE", `/api/notes/${id}`)).status, 404);
  assert.equal((await browser.request("PUT", `/api/notes/${id}`, { title: "Transferred", body: "", userId: second.response.data.user.id })).status, 400);
  assert.equal((await other.request("POST", "/api/notes", { title: "Forged", body: "", userId: owner.response.data.user.id })).status, 400);
  assert.equal((await browser.request("GET", `/api/notes/${id}`)).data.title, "Private reasoning");
  assert.equal((await browser.request("PUT", `/api/notes/${id}`, { title: "Updated by owner", body: "Revised" })).status, 200);
  assert.equal((await browser.request("DELETE", `/api/notes/${id}`)).status, 204);
  assert.equal((await browser.request("GET", `/api/notes/${id}`)).status, 404);
});

test("all private routes require authentication, including mutations with valid CSRF", async () => {
  await browser.prepare();
  for (const [method, route] of [["GET", "/api/user"], ["GET", "/api/notes"], ["GET", "/api/notes/1"], ["POST", "/api/notes"], ["PUT", "/api/notes/1"], ["DELETE", "/api/notes/1"], ["POST", "/api/logout"], ["GET", "/api/codeforces/profile"], ["GET", "/api/codeforces/submissions"], ["GET", "/api/codeforces/catalog"], ["POST", "/api/codeforces/sync"], ["GET", "/api/training/overview"], ["GET", "/api/training/history"], ["PUT", "/api/training/goal"], ["PUT", "/api/training/day"], ["POST", "/api/training/plan"], ["POST", "/api/training/assignments/1/event"]]) {
    assert.equal((await browser.request(method, route, { title: "x", body: "" })).status, 401, `${method} ${route}`);
  }
  for (const route of ["/api/sheets", "/api/contests", "/api/mentor", "/api/problems/1"]) assert.equal((await browser.request("GET", route)).status, 404);
});

test("CSRF and origin protections reject absent/mismatched tokens, cross-origin and form mutations", async () => {
  await browser.register();
  const input = { title: "protected", body: "" };
  for (const headers of [{ "X-CSRF-Token": null }, { "X-CSRF-Token": "0".repeat(64) }, { Origin: null }, { Origin: "https://attacker.invalid" }, { "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await browser.request("POST", "/api/notes", input, headers)).status, 403);
  }
  assert.equal((await browser.request("POST", "/api/logout", {}, { "X-CSRF-Token": null })).status, 403);
  assert.equal((await browser.request("POST", "/api/notes", input, { "Content-Type": "application/x-www-form-urlencoded" })).status, 415);
  const stranger = new Browser(api.base, fixture.config.APP_ORIGIN);
  await stranger.prepare();
  assert.equal((await browser.request("POST", "/api/notes", input, { "X-CSRF-Token": stranger.csrf })).status, 403);
  assert.equal((await browser.request("POST", "/api/notes", input)).status, 201);
});

test("strict input validation rejects role escalation, weak/overlong passwords, malformed IDs and body injection", async () => {
  const { input } = await browser.register();
  for (const extra of [{ role: "mentor" }, { passwordHash: "injected" }, { id: 999 }]) assert.equal((await browser.request("POST", "/api/register", { ...input, ...extra })).status, 400);
  assert.equal((await browser.request("POST", "/api/register", { ...input, password: "short" })).status, 400);
  assert.equal((await browser.request("POST", "/api/register", { ...input, password: "🔐".repeat(20) })).status, 400);
  assert.equal((await browser.request("POST", "/api/register", input)).status, 409);
  for (const input of [{ title: " ", body: "" }, { title: "x".repeat(101), body: "" }, { title: "x", body: "x".repeat(2001) }, { title: "x", body: "", createdAt: "2020-01-01" }]) assert.equal((await browser.request("POST", "/api/notes", input)).status, 400);
  for (const id of ["0", "-1", "1oops", "999999999999", "1%20or%201=1"]) assert.equal((await browser.request("GET", `/api/notes/${id}`)).status, 400);
  const oversized = await browser.request("POST", "/api/notes", { title: "x", body: "x".repeat(20_000) });
  assert.equal(oversized.status, 413);
  const malformed = await fetch(api.base + "/api/notes", { method: "POST", headers: { Cookie: browser.cookie, Origin: browser.origin, "Content-Type": "application/json", "X-CSRF-Token": browser.csrf }, body: "{" });
  assert.equal(malformed.status, 400);
});

test("sessions survive application/store recreation using PostgreSQL", async () => {
  const { response } = await browser.register();
  const isolatedPool = createDatabase(fixture.config);
  const restarted = await testApi(fixture.config, isolatedPool);
  try {
    const continuing = new Browser(restarted.base, fixture.config.APP_ORIGIN);
    continuing.cookie = browser.cookie;
    assert.equal((await continuing.request("GET", "/api/user")).data.id, response.data.user.id);
    const count = await fixture.database.pool.query("select count(*)::int as count from sessions");
    assert.ok(count.rows[0].count > 0);
  } finally { await restarted.close(); await isolatedPool.pool.end(); }
});

test("server enforces absolute session expiry even when cookie/store expiration is extended", async () => {
  const { response } = await browser.register();
  await fixture.database.pool.query("update sessions set sess = jsonb_set(sess::jsonb, '{authenticatedAt}', to_jsonb($1::bigint))::json where (sess->'passport'->>'user')::int = $2", [Date.now() - SESSION_MAX_AGE_MS - 1, response.data.user.id]);
  assert.equal((await browser.request("GET", "/api/user")).status, 401);
});

test("database migrations reapply without data loss, enforce constraints, and reject the wrong identity", async () => {
  const { response } = await browser.register();
  const note = await browser.request("POST", "/api/notes", { title: "Migration survivor", body: "Preserve me" });
  await runMigrations(fixture.database.pool, fixture.config.DATABASE_ID);
  assert.equal((await browser.request("GET", `/api/notes/${note.data.id}`)).data.body, "Preserve me");
  const migrations = await fixture.database.pool.query("select count(*)::int as count from drizzle.__drizzle_migrations");
  assert.equal(migrations.rows[0].count, 7);
  await assert.rejects(runMigrations(fixture.database.pool, randomUUID()), /identity mismatch/);
  await assert.rejects(fixture.database.pool.query("insert into training_notes (user_id,title,body) values (2147483647,'orphan','')"), { code: "23503" });
  await assert.rejects(fixture.database.pool.query("insert into training_notes (user_id,title,body) values ($1,' ','')", [response.data.user.id]), { code: "23514" });
  await assertDatabaseIdentity(fixture.database.pool, fixture.config.DATABASE_ID);
});

test("migration refuses an unmarked populated database and leaves its records untouched", async () => {
  await fixture.database.pool.query("create database cf_unrelated_test");
  const url = new URL(fixture.config.DATABASE_URL); url.pathname = "/cf_unrelated_test";
  const other = createDatabase({ DATABASE_URL: url.toString() });
  try {
    await other.pool.query("create table unrelated (id int primary key); insert into unrelated values (7)");
    await assert.rejects(runMigrations(other.pool, randomUUID(), true), /nonempty unmarked/);
    assert.deepEqual((await other.pool.query("select id from unrelated")).rows, [{ id: 7 }]);
    assert.equal((await other.pool.query("select to_regclass('public.users') as name")).rows[0].name, null);
  } finally { await other.pool.end(); }
});

test("database failures produce sanitized errors and metadata-only logs without killing the API", async () => {
  await browser.register();
  const privateText = "SYNTHETIC_PRIVATE_SENTINEL_" + randomUUID();
  await browser.request("POST", "/api/notes", { title: privateText, body: privateText });
  await fixture.database.pool.query("alter table training_notes rename to notes_temporarily_unavailable");
  try {
    const failed = await browser.request("GET", "/api/notes");
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.data, { message: "Internal server error" });
    assert.equal((await browser.request("GET", "/healthz")).status, 200);
    const logs = JSON.stringify(api.logs);
    for (const forbidden of [privateText, "password", "postgresql://", "session", browser.cookie]) assert.equal(logs.includes(forbidden), false);
    assert.ok(api.logs.every(event => Object.keys(event).sort().join(",") === "durationMs,method,route,status"));
  } finally { await fixture.database.pool.query("alter table notes_temporarily_unavailable rename to training_notes"); }
});

test("authentication rate limit bounds login and registration attempts", async () => {
  await browser.prepare();
  for (let i = 0; i < 20; i++) assert.equal((await browser.request("POST", "/api/login", {})).status, 400);
  const limited = await browser.request("POST", "/api/register", {});
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.has("retry-after"));
});

test("production cookies are Secure/HttpOnly/host-only; untrusted forwarded HTTPS cannot force a cookie", async () => {
  const secureConfig = { ...fixture.config, NODE_ENV: "production" as const, APP_ORIGIN: "https://trainer.example.invalid", TRUST_PROXY: "loopback" as const };
  const secure = await testApi(secureConfig, fixture.database);
  try {
    const client = new Browser(secure.base, secureConfig.APP_ORIGIN);
    const response = await client.request("GET", "/api/csrf", undefined, { "X-Forwarded-Proto": "https" });
    assert.match(response.cookies[0], /^__Host-cf.sid=/);
    assert.match(response.cookies[0], /; Secure/);
    assert.match(response.cookies[0], /; HttpOnly/);
    assert.match(response.cookies[0], /; SameSite=Lax/);
    assert.equal(response.cookies[0].includes("Domain="), false);
    assert.ok(response.headers.has("content-security-policy"));
  } finally { await secure.close(); }
  const untrusted = await testApi({ ...secureConfig, TRUST_PROXY: "none" }, fixture.database);
  try {
    const client = new Browser(untrusted.base, secureConfig.APP_ORIGIN);
    assert.equal((await client.request("GET", "/api/csrf", undefined, { "X-Forwarded-Proto": "https" })).cookies.length, 0);
  } finally { await untrusted.close(); }
});
