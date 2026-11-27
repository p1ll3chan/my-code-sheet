import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readConfig } from "../server/config";
import { QueryClient } from "@tanstack/react-query";
import { resetSessionCache } from "../client/src/lib/queryClient";

const valid = () => ({ APP_ORIGIN: "http://127.0.0.1:5000", DATABASE_URL: `postgresql://synthetic:${randomBytes(24).toString("hex")}@127.0.0.1:55432/synthetic`, DATABASE_ID: randomUUID(), SESSION_SECRET: randomBytes(48).toString("base64url") });
test("configuration fails closed without secrets or for unsafe/placeholder configuration", () => {
  for (const patch of [{ SESSION_SECRET: undefined }, { SESSION_SECRET: "REPLACE_WITH_CRYPTOGRAPHIC_RANDOM_SECRET" }, { DATABASE_ID: "wrong" }, { APP_ORIGIN: "http://localhost:5000/path" }, { DATABASE_URL: "sqlite:db" }, { NODE_ENV: "production" }, { TRUST_PROXY: "true" }, { PORT: "-1" }]) assert.throws(() => readConfig({ ...valid(), ...patch }));
  const privateValue = randomBytes(32).toString("hex");
  assert.throws(() => readConfig({ ...valid(), DATABASE_URL: privateValue }), error => error instanceof Error && !error.message.includes(privateValue));
  assert.equal(readConfig(valid()).HOST, "127.0.0.1");
});
test("account switch cancels old queries and removes all private cache and mutation state", async () => {
  const client = new QueryClient();
  client.setQueryData(["/api/notes", 1], [{ body: "old private data" }]);
  let cancelled = false;
  const pending = client.fetchQuery({ queryKey: ["pending", 1], queryFn: ({ signal }) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => { cancelled = true; reject(new Error("cancelled")); }); }) }).catch(() => {});
  await resetSessionCache(client, { id: 2, username: "second", name: "Second" });
  await pending;
  assert.equal(cancelled, true);
  assert.equal(client.getQueryData(["/api/notes", 1]), undefined);
  assert.deepEqual(client.getQueryCache().getAll().map(query => query.queryKey), [["/api/user"]]);
  assert.equal((client.getQueryData(["/api/user"]) as { id: number }).id, 2);
  await resetSessionCache(client, null);
  assert.equal(client.getQueryData(["/api/user"]), null);
  client.clear();
});
