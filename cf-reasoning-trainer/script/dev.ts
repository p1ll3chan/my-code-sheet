import "dotenv/config";
import { readConfig } from "../server/config";
import { startServer } from "../server/index";
import { localCluster } from "./local-config";
import { exists, projectRoot } from "./local-postgres";
import path from "node:path";

process.env.NODE_ENV = "development";
let cluster: Awaited<ReturnType<typeof localCluster>> | undefined;
try {
  const config = readConfig();
  if (await exists(path.join(projectRoot, ".local/database-owner.json"))) { cluster = await localCluster(config); await cluster.start(); }
  const stopServer = await startServer();
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; await stopServer(); await cluster?.stop(); };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop().catch(() => { process.exitCode = 1; }); });
} catch {
  console.error("Development startup failed. Run npm run setup:local or check the independent database configuration.");
  await cluster?.stop();
  process.exitCode = 1;
}
