import type { Express } from "express";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import config from "../vite.config";

export async function setupVite(server: Server, app: Express) {
  const vite = await createViteServer({ ...config, configFile: false, server: {
    ...config.server, middlewareMode: true, hmr: { server, path: "/vite-hmr" },
  }, appType: "custom" });
  app.use(vite.middlewares);
  app.get("*", async (req, res, next) => {
    try {
      const template = await readFile(path.resolve(import.meta.dirname, "../client/index.html"), "utf8");
      res.type("html").send(await vite.transformIndexHtml(req.originalUrl, template));
    } catch (error) { next(error); }
  });
  return () => vite.close();
}
