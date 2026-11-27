import "dotenv/config";
import { readConfig } from "../server/config";
import { localCluster } from "./local-config";

let cluster: Awaited<ReturnType<typeof localCluster>> | undefined;
try {
  cluster = await localCluster(readConfig());
  await cluster.start();
  console.log("Local PostgreSQL is running on loopback. Press Ctrl+C to stop gracefully.");
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { if (!closing) { closing = true; void cluster?.stop().catch(() => { process.exitCode = 1; }); } });
} catch {
  console.error("Local PostgreSQL startup failed. Check setup, port availability and project identity.");
  await cluster?.stop();
  process.exitCode = 1;
}
