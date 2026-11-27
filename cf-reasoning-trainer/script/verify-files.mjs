import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skipped = new Set(["node_modules", "dist", ".local", ".test-data", "coverage", "test-results", "playwright-report"]);
const files = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name) || (entry.name.startsWith(".env") && entry.name !== ".env.example")) continue;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unexpected symlink in distributable files");
    if (entry.name === ".git") throw new Error("Git metadata/history is not part of the migration deliverable");
    if (entry.isDirectory()) await visit(full); else files.push(full);
  }
}
await visit(root);
for (const file of files) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (/\.(db|sqlite\d*|dump|backup|bak|pem|key|p12|pfx|log)$/i.test(file) || (file.endsWith(".sql") && !relative.startsWith("migrations/"))) throw new Error(`Private artifact in distributable files: ${relative}`);
  const text = await readFile(file, "utf8");
  const patterns = [ /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /(?:sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,})/, /SESSION_SECRET\s*(?:\|\||\?\?)\s*["'][^"']+["']/ ];
  if (patterns.some(pattern => pattern.test(text))) throw new Error(`Credential-pattern match in ${relative}; value suppressed`);
  if (/^(client|server|shared|script)\//.test(relative) && /(?:\.\.\/my-code-sheet|G:[/\\]CF_Practice_Setup[/\\]my-code-sheet)/i.test(text)) throw new Error(`Application depends on original project: ${relative}`);
}
const example = await readFile(path.join(root, ".env.example"), "utf8");
for (const name of ["DATABASE_URL", "DATABASE_ID", "SESSION_SECRET"]) {
  const value = example.split(/\r?\n/).find(line => line.startsWith(name + "="));
  if (!value?.includes("REPLACE_")) throw new Error(`Environment example must use a placeholder for ${name}`);
}
console.log(`Reviewed ${files.length} distributable files: no copied history, database/private-key artifacts, credential-pattern matches or source-project runtime references. Local generated state is excluded.`);
