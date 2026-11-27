import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, writeFile, unlink, access, readFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const execute = promisify(execFile);
export const projectRoot = path.resolve(import.meta.dirname, "..");
export async function exists(file: string) { try { await access(file); return true; } catch { return false; } }

async function validateLocalPath(directory: string) {
  const resolved = path.resolve(directory);
  if (![".local", ".test-data"].some(base => resolved.startsWith(path.join(projectRoot, base) + path.sep))) throw new Error("Database directory must be inside this project's private local/test directory");
  let current = resolved;
  while (current !== projectRoot) {
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) throw new Error("Database path contains a symlink/reparse point");
    current = path.dirname(current);
  }
  if (await realpath(projectRoot) !== projectRoot) throw new Error("Use the real project path for local database management");
}

export async function managedPostgres(options: { directory: string; port: number; password: string; user?: string }) {
  await validateLocalPath(options.directory);
  const user = options.user ?? "cf_local";
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535 || !/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error("Invalid local PostgreSQL options");
  // The pinned embedded-postgres dev dependency installs the matching binary
  // package. Use its exported paths, but manage processes with hidden windows and
  // graceful pg_ctl shutdown (the upstream Windows wrapper forcibly taskkills).
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const binaryPackage = `@embedded-postgres/${platform}-${process.arch}`;
  const binaries = await import(binaryPackage) as { initdb: string; postgres: string; pg_ctl: string };
  let child: ChildProcess | undefined;
  const env = { ...process.env, LC_MESSAGES: "C" };
  return {
    async initialize() {
      if (await exists(path.join(options.directory, "PG_VERSION"))) return;
      await mkdir(options.directory, { recursive: true, mode: 0o700 });
      if ((await readdir(options.directory)).length) throw new Error("Refusing to initialize a nonempty database directory");
      const passwordFile = path.join(path.dirname(options.directory), `init-password-${randomUUID()}`);
      await writeFile(passwordFile, options.password, { mode: 0o600, flag: "wx" });
      try {
        await execute(binaries.initdb, ["-D", options.directory, "--auth=scram-sha-256", `--username=${user}`, `--pwfile=${passwordFile}`, "--encoding=UTF8", "--locale=C"], { env, windowsHide: true, timeout: 60_000 });
      } catch { throw new Error("Local PostgreSQL initialization failed; no existing database was reset"); }
      finally { await unlink(passwordFile); }
    },
    async start() {
      if (child || await exists(path.join(options.directory, "postmaster.pid"))) throw new Error("Local PostgreSQL is already running or requires recovery; refusing a second instance");
      const processHandle = spawn(binaries.postgres, ["-D", options.directory, "-p", String(options.port), "-h", "127.0.0.1", "-c", "unix_socket_directories=", "-c", "log_statement=none"], { env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      child = processHandle;
      let failed = false;
      processHandle.on("error", () => { failed = true; });
      processHandle.stderr?.on("data", () => { /* Never log SQL or connection details. */ });
      for (let attempt = 0; attempt < 150; attempt++) {
        if (failed || processHandle.exitCode !== null) { child = undefined; throw new Error("Local PostgreSQL failed to start; check port availability and directory permissions"); }
        const client = new pg.Client({ host: "127.0.0.1", port: options.port, user, password: options.password, database: "postgres", connectionTimeoutMillis: 300 });
        try { await client.connect(); await client.query("select 1"); return; } catch { await delay(100); } finally { await client.end().catch(() => {}); }
      }
      throw new Error("Local PostgreSQL startup timed out");
    },
    async stop() {
      if (!child || child.exitCode !== null) { child = undefined; return; }
      const pid = (await readFile(path.join(options.directory, "postmaster.pid"), "utf8")).split(/\r?\n/)[0];
      if (Number(pid) !== child.pid) throw new Error("Database PID mismatch; refusing to stop another process");
      await execute(binaries.pg_ctl, ["-D", options.directory, "-m", "fast", "-w", "-t", "30", "stop"], { env, windowsHide: true, timeout: 35_000 });
      child = undefined;
    },
  };
}
