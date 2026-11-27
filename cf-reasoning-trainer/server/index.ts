import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { readConfig } from "./config";
import { createDatabase } from "./db";
import { createApp } from "./app";
import { errorHandler } from "./http";

export async function startServer() {
  const config = readConfig();
  const database = createDatabase(config);
  try {
    const { app, close: closeSessions } = await createApp(config, database);
    const server = createServer(app);
    let closeVite: (() => Promise<void>) | undefined;
    if (process.env.NODE_ENV === "production") {
      const publicDir = path.resolve(import.meta.dirname, "public");
      app.use(express.static(publicDir, { index: false }));
      app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
    } else {
      const { setupVite } = await import("./vite");
      closeVite = await setupVite(server, app);
    }
    app.use(errorHandler);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.PORT, config.HOST, resolve); });
    console.log(`CF Reasoning Trainer listening on ${config.HOST}:${config.PORT}`);
    let closing = false;
    return async () => {
      if (closing) return;
      closing = true;
      await closeVite?.();
      await new Promise<void>(resolve => server.close(() => resolve()));
      closeSessions();
      await database.pool.end();
    };
  } catch (error) { await database.pool.end(); throw error; }
}

// Startup is invoked by portable development/production entrypoints.
