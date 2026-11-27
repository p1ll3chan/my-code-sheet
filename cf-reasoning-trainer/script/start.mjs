process.env.NODE_ENV = "production";
try {
  const { startServer } = await import("../dist/index.js");
  const stop = await startServer();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop().catch(() => { process.exitCode = 1; }); });
} catch {
  console.error("Startup failed. Check environment validation, database identity, migrations and build output.");
  process.exitCode = 1;
}
