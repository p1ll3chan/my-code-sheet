import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { testDatabase, freePort } from "./helpers";
import { projectRoot } from "../script/local-postgres";

test("production bundle starts independently and serves the client and protected API", async () => {
  const fixture = await testDatabase();
  const port = await freePort();
  let output = "";
  const configEnv = Object.fromEntries(Object.entries(fixture.config).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  const child = spawn(process.execPath, ["script/start.mjs"], { cwd: projectRoot, windowsHide: true,
    env: { ...process.env, ...configEnv, PORT: String(port), NODE_ENV: "production", APP_ORIGIN: `https://127.0.0.1:${port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", chunk => { output += String(chunk); });
  child.stderr?.on("data", chunk => { output += String(chunk); });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) break;
      try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).status === 200; } catch { /* bounded startup wait */ }
      if (ready) break;
      await delay(100);
    }
    assert.equal(ready, true, "Production bundle did not start");
    const html = await fetch(`http://127.0.0.1:${port}/dashboard`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /CF Reasoning Trainer/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/user`)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/notes`)).status, 401);
    const bundle = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    assert.equal(/from ["'](?:vite|@vitejs\/plugin-react)["']/.test(bundle), false, "Production server must not import dev dependencies");
    assert.equal(output.includes(fixture.config.DATABASE_URL), false);
    assert.equal(output.includes(fixture.config.SESSION_SECRET), false);
  } finally {
    if (child.exitCode === null) { const stopped = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGTERM"); await stopped; }
    await fixture.close();
  }
});
