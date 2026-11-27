import type { Pool, PoolClient } from "pg";
export const APPLICATION_ID = "cf-reasoning-trainer";

export async function assertDatabaseIdentity(client: Pool | PoolClient, instanceId: string) {
  const table = await client.query("select to_regclass('public.project_identity') as name");
  if (!table.rows[0].name) throw new Error("Database is not initialized for this project; run the documented setup/migration command");
  const identity = await client.query("select app, instance_id from public.project_identity where id = 1");
  if (identity.rows[0]?.app !== APPLICATION_ID || identity.rows[0]?.instance_id !== instanceId) throw new Error("Database identity mismatch; refusing to use this database");
}
