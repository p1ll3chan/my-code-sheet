import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import path from "node:path";
import { assertDatabaseIdentity, APPLICATION_ID } from "../server/db/identity";

export async function runMigrations(pool: Pool, instanceId: string, initialize = false) {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(82461008)");
    const result = await client.query("select to_regclass('public.project_identity') as name");
    const fresh = !result.rows[0].name;
    if (fresh) {
      if (!initialize) throw new Error("Unmarked database; initialization of an empty independent target must be explicit");
      const objects = await client.query("select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' limit 1");
      if (objects.rowCount) throw new Error("Refusing to initialize a nonempty unmarked database");
    } else { await assertDatabaseIdentity(client, instanceId); }
    await migrate(drizzle(client), { migrationsFolder: path.resolve(import.meta.dirname, "../migrations") });
    if (fresh) await client.query("insert into public.project_identity (id, app, instance_id) values (1, $1, $2)", [APPLICATION_ID, instanceId]);
    await assertDatabaseIdentity(client, instanceId);
  } finally {
    await client.query("select pg_advisory_unlock(82461008)").catch(() => {});
    client.release();
  }
}
