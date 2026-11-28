import { createHash } from "node:crypto";
import { and, between, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { cfProblems, datasetImportRuns, datasetProblems, problemEditorials, problemStatements, problemTestSets } from "../db/schema";
import { buildAnalysisInput, canonicalStatementContent, sha256, statementHash, statementRegistrationSchema,
  validateStatement, type StatementRegistration } from "./statement";

// Phase 4.5: map rows of the pinned open-r1/codeforces dataset onto the existing
// statement contract. Only statement fields reach problem_statements; tags and
// editorials go to the quarantined problem_editorials table; tests go to
// problem_test_sets for the sandboxed runner. Nothing here calls a network or model.

export const TEST_SET_CAP_BYTES = 8 * 1024 * 1024; // CEO-9
/** Transaction-scoped advisory lock shared by every statement writer. */
export const STATEMENT_WRITE_LOCK = 82461009;

export type DatasetRow = {
  id?: string; aliases?: string[] | null; contest_id?: string | number | null; index?: string | null;
  title?: string | null; description?: string | null; input_format?: string | null; output_format?: string | null;
  interaction_format?: string | null; note?: string | null; examples?: { input?: string | null; output?: string | null }[] | null;
  time_limit?: number | null; memory_limit?: number | null; editorial?: string | null; tags?: string[] | null;
  official_tests?: { input?: string | null; output?: string | null }[] | null; official_tests_complete?: boolean | null;
  input_mode?: string | null; generated_checker?: string | null; generated_tests?: number | null; split?: string | null;
  official_tests_oversize?: boolean | null;
};

const text = z.string().nullish();
const pair = z.object({ input: text, output: text }).passthrough();
/** Field types the importer relies on; a row that fails is skipped as invalid_row, never a crash mid-transaction. */
export const datasetRowSchema = z.object({
  id: z.union([z.string(), z.number()]).nullish(), aliases: z.array(z.string()).nullish(),
  contest_id: z.union([z.string(), z.number()]).nullish(), index: z.union([z.string(), z.number()]).nullish(),
  title: text, description: text, input_format: text, output_format: text, interaction_format: text, note: text,
  examples: z.array(pair).nullish(), time_limit: z.number().nullish(), memory_limit: z.number().nullish(),
  editorial: text, tags: z.array(z.string().max(200)).max(64).nullish(), official_tests: z.array(pair).nullish(),
  official_tests_complete: z.boolean().nullish(), input_mode: text, generated_checker: text,
  generated_tests: z.number().nullish(), split: text, official_tests_oversize: z.boolean().nullish(),
}).passthrough();

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** First text defect in any key or string value: NUL (rejected by PostgreSQL) or an unpaired surrogate (rejected by jsonb). */
export function textDefect(value: unknown): "contains_nul" | "unpaired_surrogate" | null {
  const check = (s: string) => s.includes("\0") ? "contains_nul" as const : LONE_SURROGATE.test(s) ? "unpaired_surrogate" as const : null;
  if (typeof value === "string") return check(value);
  if (Array.isArray(value)) { for (const item of value) { const d = textDefect(item); if (d) return d; } return null; }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) { const d = check(key) ?? textDefect(item); if (d) return d; }
  }
  return null;
}

export type SkipReason = "malformed_json" | "invalid_row" | "not_in_catalog" | "missing_examples"
  | "statement_too_long" | "statement_incomplete" | "duplicate_problem" | "other_source_present"
  | "contains_nul" | "unpaired_surrogate" | "row_too_large" | "statement_revoked";

/** Dataset identities for a row: its own contest/index plus Div.1/Div.2 aliases. */
export function datasetIdentities(row: DatasetRow): { contestId: number; index: string }[] {
  const ids = [`${row.contest_id ?? ""}/${row.index ?? ""}`, ...(row.aliases ?? [])];
  const result: { contestId: number; index: string }[] = [];
  for (const ident of ids) {
    const [contest, index] = String(ident).split("/");
    if (/^\d+$/.test(contest ?? "") && index) result.push({ contestId: Number(contest), index });
  }
  return result;
}

/** CEO-17: any checker, interaction or file I/O excludes a problem from exact-match judging. */
export function checkerRequired(row: DatasetRow) {
  return Boolean(row.generated_checker?.trim()) || Boolean(row.interaction_format?.trim()) || (row.input_mode ?? "stdio") === "file";
}

/** Constraint sentences are embedded in the input format; keep the ones with bounds, else the whole section. */
export function extractConstraints(inputFormat: string) {
  const sentences = inputFormat.split(/(?<=[.;])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const bounded = sentences.filter(s => /\\le|\\leq|\\lt|\\ge|≤|≥|<|>/.test(s));
  return bounded.length ? bounded.slice(0, 128) : [inputFormat.trim()];
}

export function rowToStatement(row: DatasetRow, problemKey: string, datasetRef: string, approvedAt: string)
  : { ok: true; value: StatementRegistration } | { ok: false; reason: SkipReason } {
  const examples = (row.examples ?? []).filter(e => typeof e?.input === "string" && typeof e?.output === "string");
  if (!examples.length) return { ok: false, reason: "missing_examples" };
  const description = row.description?.trim() ?? "";
  const statement = row.note?.trim() ? `${description}\n\nNote:\n${row.note.trim()}` : description;
  const input = row.input_format?.trim() ?? "", output = row.output_format?.trim() ?? "";
  if (!description || !input || !output) return { ok: false, reason: "statement_incomplete" };
  if ([statement, input, output].some(text => text.length > 60_000)) return { ok: false, reason: "statement_too_long" };
  const parsed = statementRegistrationSchema.safeParse({
    problemKey, locale: "en", statement, inputSpecification: input, outputSpecification: output,
    constraints: extractConstraints(input),
    examples: examples.slice(0, 128).map(e => ({ input: e.input!, output: e.output!, explanation: null })),
    sampleComparison: checkerRequired(row) ? "unsupported" : "exact-tokens",
    sourceKind: "licensed-dataset", sourceRef: `open-r1/codeforces@${datasetRef}#${row.id ?? `${row.contest_id}/${row.index}`}`,
    grantRef: "personal-use:open-r1/codeforces (user decision 2026-11-28)",
    attribution: "open-r1/codeforces, Hugging Face. License listed as cc-by-4.0 (card header) and ODC-By 4.0 (card body). Problems © Codeforces.",
    approvedAt, processingAllowed: true, sharingAllowed: false, scope: "shared", ownerId: null,
  });
  if (!parsed.success) return { ok: false, reason: "statement_incomplete" };
  const tentative = buildAnalysisInput("00000000-0000-4000-8000-000000000000", statementHash(parsed.data), canonicalStatementContent(parsed.data));
  if (!validateStatement(tentative).usable) return { ok: false, reason: "statement_incomplete" };
  return { ok: true, value: parsed.data };
}

/** Complete official tests within the 8 MB cap, or null (counted as tests-incomplete). */
export function officialTestSet(row: DatasetRow) {
  if (!row.official_tests_complete) return null;
  const raw = row.official_tests ?? [];
  const tests = raw.filter(t => typeof t?.input === "string" && typeof t?.output === "string")
    .map(t => ({ input: t.input!, output: t.output! }));
  // A suite with any malformed test is not complete: never judge against part of it.
  if (!tests.length || tests.length !== raw.length) return null;
  const totalBytes = tests.reduce((n, t) => n + Buffer.byteLength(t.input) + Buffer.byteLength(t.output), 0);
  if (totalBytes === 0 || totalBytes > TEST_SET_CAP_BYTES) return null;
  return { tests, totalBytes, testsHash: sha256(JSON.stringify(tests)) };
}

const INT4_MAX = 2_147_483_647;
/** A value that fits a non-negative int4 column, or null (never a DB error mid-transaction). */
export function boundedInt(value: unknown, scale = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scaled = Math.round(value * scale);
  return scaled >= 0 && scaled <= INT4_MAX ? scaled : null;
}
export const MAX_ROW_CHARS = 64 * 1024 * 1024;

export type ImportReport = {
  datasetRef: string; rowsRead: number; matched: number; statementsInserted: number; statementsUnchanged: number;
  officialTestSets: number; officialTestSetsInserted: number; testsIncomplete: number; testsOversize: number; checkerRequired: number; editorials: number;
  skipped: Partial<Record<SkipReason, { count: number; firstKeys: string[] }>>;
};

/**
 * Import every eligible row in one transaction (CEO-7): a thrown error rolls the
 * whole run back; a bad row is skipped and counted with its reason.
 */
export async function importDataset(db: Database, openLines: () => AsyncIterable<string> | Iterable<string>, datasetRef: string,
  options: { now?: Date; expectedRows?: number; expectedSha256?: string } = {}) {
  const now = options.now ?? new Date();
  const startedAt = now;
  const approvedAt = now.toISOString();
  const report: ImportReport = { datasetRef, rowsRead: 0, matched: 0, statementsInserted: 0, statementsUnchanged: 0,
    officialTestSets: 0, officialTestSetsInserted: 0, testsIncomplete: 0, testsOversize: 0, checkerRequired: 0, editorials: 0, skipped: {} };
  const skip = (reason: SkipReason, key: string) => {
    const entry = report.skipped[reason] ??= { count: 0, firstKeys: [] };
    entry.count++; if (entry.firstKeys.length < 20) entry.firstKeys.push(key);
  };
  // Eligibility uses the catalog's rating (L14), the same rule as registerStatement.
  const eligible = new Map<string, string>();
  for (const problem of await db.select({ key: cfProblems.key, contestId: cfProblems.contestId, index: cfProblems.index }).from(cfProblems)
    .where(and(eq(cfProblems.inProblemset, true), isNotNull(cfProblems.contestId), between(cfProblems.rating, 1200, 2000)))) {
    eligible.set(`${problem.contestId}/${problem.index}`, problem.key);
  }
  await db.transaction(async tx => {
    // Serializes with registerStatement so a concurrent registration cannot interleave (service.ts).
    await tx.execute(sql`select pg_advisory_xact_lock(${STATEMENT_WRITE_LOCK})`);
    const seen = new Set<string>();
    // service.ts treats the newest shared statement as current regardless of source,
    // so a dataset row must never shadow an operator-approved or fixture statement.
    const otherSource = new Set((await tx.select({ key: problemStatements.problemKey }).from(problemStatements)
      .where(and(eq(problemStatements.scope, "shared"), ne(problemStatements.sourceKind, "licensed-dataset"), isNull(problemStatements.revokedAt))))
      .map(r => r.key));
    // Revocation is per problem: once any dataset version is revoked, no later revision re-imports it.
    const revoked = new Set((await tx.select({ key: problemStatements.problemKey }).from(problemStatements)
      .where(and(eq(problemStatements.sourceKind, "licensed-dataset"), isNotNull(problemStatements.revokedAt))))
      .map(r => r.key));
    // A skipped problem keeps nothing judgeable or linked from an earlier import.
    const retire = async (problemKey: string) => {
      await tx.update(problemTestSets).set({ isCurrent: false }).where(and(eq(problemTestSets.problemKey, problemKey), eq(problemTestSets.isCurrent, true)));
      await tx.update(datasetProblems).set({ statementId: null }).where(eq(datasetProblems.problemKey, problemKey));
    };
    // Returns "ok" when the problem was imported, else the skip reason. Nothing is
    // written for a problem until its statement validates.
    const importProblem = async (row: DatasetRow, problemKey: string, label: string): Promise<"ok" | SkipReason> => {
      if (otherSource.has(problemKey)) return "other_source_present";
      if (revoked.has(problemKey)) return "statement_revoked";
      const statement = rowToStatement(row, problemKey, datasetRef, approvedAt);
      if (!statement.ok) return statement.reason;
      const value = statement.value;
      const contentHash = statementHash(value);
      const inserted = await tx.insert(problemStatements).values({ problemKey, ownerId: null, scope: "shared", locale: value.locale,
        sourceKind: value.sourceKind, sourceRef: value.sourceRef, grantRef: value.grantRef, attribution: value.attribution,
        processingAllowed: true, sharingAllowed: false, contentHash, content: canonicalStatementContent(value),
        approvedAt: new Date(value.approvedAt) }).onConflictDoNothing().returning({ id: problemStatements.id });
      let statementId = inserted[0]?.id;
      if (!statementId) {
        // Same content already stored: honor a revocation instead of reporting it as healthy.
        const [existing] = await tx.select({ id: problemStatements.id, revokedAt: problemStatements.revokedAt }).from(problemStatements)
          .where(and(eq(problemStatements.problemKey, problemKey), eq(problemStatements.contentHash, contentHash), eq(problemStatements.grantRef, value.grantRef)));
        if (!existing || existing.revokedAt) return "statement_revoked";
        statementId = existing.id;
        report.statementsUnchanged++;
      } else report.statementsInserted++;
      const checker = checkerRequired(row);
      if (checker) report.checkerRequired++;
      const meta = { datasetRef, datasetId: label.slice(0, 64), split: row.split === "test" ? "test" : "train",
        timeLimitMs: boundedInt(row.time_limit, 1000), memoryLimitMb: boundedInt(row.memory_limit),
        checkerRequired: checker, officialTestsComplete: Boolean(row.official_tests_complete),
        generatedTestsCount: boundedInt(row.generated_tests) ?? 0, statementId, importedAt: now };
      await tx.insert(datasetProblems).values({ problemKey, ...meta }).onConflictDoUpdate({ target: datasetProblems.problemKey, set: meta });
      // Exactly one current test set per problem, or none: older sets never stay judgeable.
      await tx.update(problemTestSets).set({ isCurrent: false }).where(eq(problemTestSets.problemKey, problemKey));
      // Checker-required problems cannot be judged by exact match (CEO-17): store no test set.
      const tests = checker ? null : officialTestSet(row);
      if (tests) {
        const stored = await tx.insert(problemTestSets).values({ problemKey, datasetRef, source: "official", complete: true,
          testCount: tests.tests.length, totalBytes: tests.totalBytes, testsHash: tests.testsHash, tests: tests.tests, isCurrent: true })
          .onConflictDoNothing({ target: [problemTestSets.problemKey, problemTestSets.testsHash] }).returning({ id: problemTestSets.id });
        if (!stored.length) await tx.update(problemTestSets).set({ isCurrent: true })
          .where(and(eq(problemTestSets.problemKey, problemKey), eq(problemTestSets.testsHash, tests.testsHash)));
        report.officialTestSets++;
        if (stored.length) report.officialTestSetsInserted++;
      } else if (!checker) { if (row.official_tests_oversize) report.testsOversize++; else report.testsIncomplete++; }
      const editorial = { datasetRef, editorial: row.editorial?.trim() || null, tags: Array.isArray(row.tags) ? row.tags : [], importedAt: now };
      await tx.insert(problemEditorials).values({ problemKey, ...editorial }).onConflictDoUpdate({ target: problemEditorials.problemKey, set: editorial });
      if (editorial.editorial) report.editorials++;
      return "ok";
    };
    // Open the source only now: a stream started before the awaits above would
    // emit lines before iteration begins, and readline drops those silently.
    const hash = options.expectedSha256 ? createHash("sha256") : null;
    for await (const line of openLines()) {
      hash?.update(line + "\n");
      if (!line.trim()) continue;
      report.rowsRead++;
      if (line.length > MAX_ROW_CHARS) { skip("row_too_large", `line ${report.rowsRead}`); continue; }
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { skip("malformed_json", `line ${report.rowsRead}`); continue; }
      // PostgreSQL rejects NUL and jsonb rejects unpaired surrogates; both reach JSON only as \u escapes.
      const defect = /\\u(0000|[dD][89a-fA-F])/.test(line) ? textDefect(parsed) : null;
      if (defect) { skip(defect, `line ${report.rowsRead}`); continue; }
      const checked = datasetRowSchema.safeParse(parsed);
      if (!checked.success || Array.isArray(parsed)) { skip("invalid_row", `line ${report.rowsRead}`); continue; }
      const row = checked.data as DatasetRow;
      const label = String(row.id ?? `${row.contest_id}/${row.index}`).slice(0, 64);
      // A row can stand for several catalog problems (Div.1/Div.2 aliases): import each.
      const keys = [...new Set(datasetIdentities(row).map(id => eligible.get(`${id.contestId}/${id.index}`)).filter((k): k is string => Boolean(k)))];
      if (!keys.length) { skip("not_in_catalog", label); continue; }
      for (const problemKey of keys) {
        if (seen.has(problemKey)) { skip("duplicate_problem", problemKey); continue; }
        report.matched++;
        const result = await importProblem(row, problemKey, label);
        // Only a successful import claims the key; a later valid row may still fill it.
        if (result === "ok") seen.add(problemKey); else { await retire(problemKey); skip(result, problemKey); }
      }
    }
    if (options.expectedRows !== undefined && options.expectedRows !== report.rowsRead) {
      throw new Error(`ROW_COUNT_MISMATCH: read ${report.rowsRead} rows, manifest expects ${options.expectedRows}`);
    }
    if (hash && hash.digest("hex") !== options.expectedSha256) throw new Error("HASH_MISMATCH: file content differs from its manifest");
    await tx.insert(datasetImportRuns).values({ datasetRef, startedAt, finishedAt: new Date(), report });
  });
  return report;
}

/** Safe one-line description of an import failure: never a query, its parameters or row text. */
export function describeImportError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === "string") return /^[0-9A-Z]{5}$/.test(e.code)
      ? `database error SQLSTATE ${e.code}${typeof e.constraint === "string" ? ` (constraint ${e.constraint})` : ""}`
      : `file or connection error ${e.code.slice(0, 32)}`;
    current = e.cause;
  }
  if (error instanceof Error && !("query" in error) && !("params" in error)) return error.message;
  return "database or file error";
}
