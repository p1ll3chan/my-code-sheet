import test from "node:test";
import { eq } from "drizzle-orm";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { cfProblems, datasetImportRuns, datasetProblems, problemEditorials, problemStatements, problemTestSets } from "../server/db/schema";
import { boundedInt, checkerRequired, datasetIdentities, textDefect, extractConstraints, importDataset, officialTestSet, rowToStatement,
  TEST_SET_CAP_BYTES, type DatasetRow } from "../server/reasoning/dataset";
import { statementRegistrationSchema } from "../server/reasoning/statement";
import { testDatabase } from "./helpers";

const REF = "fbe3f6e903ee854eec2e69e9d96d0306cde59baf";
function row(contest: number, index: string, extra: Partial<DatasetRow> = {}): DatasetRow {
  return { id: `${contest}/${index}`, contest_id: String(contest), index, aliases: [], title: `P ${contest}${index}`,
    description: "Given an array, print its sum.", input_format: "The first line contains n ($1 \\le n \\le 10^5$). The second line contains n integers.",
    output_format: "Print one integer.", note: "In the first example the sum is 3.",
    examples: [{ input: "2\n1 2\n", output: "3\n" }], time_limit: 1, memory_limit: 256, editorial: "Add them up.", tags: ["math"],
    official_tests: [{ input: "2\n1 2\n", output: "3\n" }, { input: "1\n5\n", output: "5\n" }], official_tests_complete: true,
    input_mode: "stdio", generated_checker: null, generated_tests: 0, split: "train", ...extra };
}

test("dataset rows map to the statement contract without tags or editorials", () => {
  assert.deepEqual(datasetIdentities(row(2063, "A", { aliases: ["2062/C", "bad"] })), [{ contestId: 2063, index: "A" }, { contestId: 2062, index: "C" }]);
  assert.equal(checkerRequired(row(1, "A")), false);
  assert.equal(checkerRequired(row(1, "A", { generated_checker: "int main(){}" })), true);
  assert.equal(checkerRequired(row(1, "A", { interaction_format: "Interact." })), true);
  assert.equal(checkerRequired(row(1, "A", { input_mode: "file" })), true);
  assert.deepEqual(extractConstraints("The first line contains n ($1 \\le n \\le 10^5$). Then n numbers."), ["The first line contains n ($1 \\le n \\le 10^5$)."]);
  assert.deepEqual(extractConstraints("Just a line."), ["Just a line."]);

  const mapped = rowToStatement(row(1, "A"), "c:1:A", REF, "2026-11-28T00:00:00.000Z");
  assert.ok(mapped.ok);
  const value = mapped.value;
  assert.equal(statementRegistrationSchema.safeParse(value).success, true);
  assert.equal(value.sourceKind, "licensed-dataset");
  assert.equal(value.scope, "shared");
  assert.equal(value.sharingAllowed, false);
  assert.equal(value.sampleComparison, "exact-tokens");
  assert.match(value.statement, /Note:\nIn the first example/);
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /Add them up|"math"/, "editorial and tags never enter the statement");

  assert.equal(rowToStatement(row(1, "A", { generated_checker: "x" }), "c:1:A", REF, "2026-11-28T00:00:00.000Z").ok
    && (rowToStatement(row(1, "A", { generated_checker: "x" }), "c:1:A", REF, "2026-11-28T00:00:00.000Z") as { value: { sampleComparison: string } }).value.sampleComparison, "unsupported");
  assert.deepEqual(rowToStatement(row(1, "A", { examples: [] }), "c:1:A", REF, "x"), { ok: false, reason: "missing_examples" });
  assert.deepEqual(rowToStatement(row(1, "A", { output_format: " " }), "c:1:A", REF, "x"), { ok: false, reason: "statement_incomplete" });
  assert.equal(statementRegistrationSchema.safeParse({ ...value, sharingAllowed: true }).success, false, "dataset statements are never shareable");

  assert.equal(officialTestSet(row(1, "A"))?.tests.length, 2);
  assert.equal(officialTestSet(row(1, "A", { official_tests_complete: false })), null);
  assert.equal(officialTestSet(row(1, "A", { official_tests: [{ input: "x".repeat(TEST_SET_CAP_BYTES), output: "y" }] })), null, "over the 8 MB cap");
  assert.equal(officialTestSet(row(1, "A", { official_tests: [{ input: "1\n", output: "1\n" }, { input: null, output: "2\n" }] })), null, "a partly malformed suite is not complete");
  assert.equal(officialTestSet(row(1, "A", { official_tests: [{ input: "", output: "" }] })), null, "a zero-byte suite is not stored");
  assert.equal(boundedInt(2.5, 1000), 2500);
  assert.equal(boundedInt(3e9), null, "over int4 is dropped, never a DB error");
  assert.equal(boundedInt(-1), null);
  assert.equal(boundedInt(Number.NaN), null);
});

test("dataset import is transactional, idempotent and reports every skip reason", async () => {
  const fixture = await testDatabase();
  const { db } = fixture.database;
  try {
    for (const [contestId, index, rating] of [[7001, "A", 1200], [7001, "B", 1500], [7001, "C", 900], [7002, "D", 1800]] as const) {
      await db.insert(cfProblems).values({ key: `c:${contestId}:${index}`, contestId, index, name: `${contestId}${index}`, type: "PROGRAMMING",
        rating, inProblemset: true, url: `https://example.invalid/${contestId}/${index}` });
    }
    const lines = [
      JSON.stringify(row(7001, "A")),                                              // imported with official tests
      JSON.stringify(row(7001, "B", { official_tests_complete: false })),          // imported, tests incomplete
      JSON.stringify(row(7001, "C")),                                              // rating 900: not eligible
      JSON.stringify(row(9999, "Z", { aliases: ["7002/D"], generated_checker: "c" })), // matched via alias, checker-required
      JSON.stringify(row(7001, "A")),                                              // duplicate in the same file
      "{not json",                                                                 // malformed
      JSON.stringify(row(7002, "D", { examples: [] })),                            // already matched via alias: duplicate
    ];
    const first = await importDataset(db, () => lines, REF);
    assert.equal(first.rowsRead, 7);
    assert.equal(first.matched, 3);
    assert.equal(first.statementsInserted, 3);
    assert.equal(first.officialTestSets, 1);
    assert.equal(first.testsIncomplete, 1, "checker-required problems are counted separately, never as test sets");
    assert.equal(first.checkerRequired, 1);
    assert.equal(first.skipped.not_in_catalog?.count, 1);
    assert.equal(first.skipped.malformed_json?.count, 1);
    assert.equal(first.skipped.duplicate_problem?.count, 2);

    const statements = await db.select().from(problemStatements);
    assert.equal(statements.length, 3);
    assert.ok(statements.every(s => s.sourceKind === "licensed-dataset" && s.scope === "shared" && !s.sharingAllowed && s.ownerId === null));
    assert.ok(statements.every(s => !JSON.stringify(s.content).includes("Add them up")));
    assert.equal((await db.select().from(problemTestSets)).length, 1);
    assert.equal((await db.select().from(problemEditorials)).length, 3);
    const meta = await db.select().from(datasetProblems);
    assert.equal(meta.find(m => m.problemKey === "c:7002:D")?.checkerRequired, true);
    assert.equal(meta.find(m => m.problemKey === "c:7001:A")?.timeLimitMs, 1000);

    const second = await importDataset(db, () => lines, REF);
    assert.equal(second.statementsInserted, 0);
    assert.equal(second.statementsUnchanged, 3);
    assert.equal(first.officialTestSetsInserted, 1);
    assert.equal(second.officialTestSetsInserted, 0, "a rerun reports no newly written test sets");
    assert.equal((await db.select().from(problemStatements)).length, 3, "rerun adds no statement versions");
    assert.equal((await db.select().from(problemTestSets)).length, 1, "rerun adds no test sets");
    assert.equal((await db.select().from(problemTestSets).where(eq(problemTestSets.problemKey, "c:7001:A")))[0]?.isCurrent, true,
      "a rerun keeps the unchanged set current");
    assert.equal((await db.select().from(datasetImportRuns)).length, 2);

    // Regression: a file stream opened before the catalog query dropped the first
    // lines silently. Reading through readline, every line must be counted.
    const dir = await mkdtemp(path.join(tmpdir(), "cf-dataset-"));
    try {
      const file = path.join(dir, "rows.jsonl");
      await writeFile(file, Array.from({ length: 300 }, (_, i) => JSON.stringify(row(8000 + i, "A"))).join("\n") + "\n");
      const fromFile = await importDataset(db, () => createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity }), REF);
      assert.equal(fromFile.rowsRead, 300, "no line is lost before iteration starts");
    } finally { await rm(dir, { recursive: true }); }

    // A failure mid-file rolls the whole run back (CEO-7).
    async function* failing() { yield JSON.stringify(row(7001, "B", { description: "Changed text." })); throw new Error("read failed"); }
    await assert.rejects(importDataset(db, failing, REF), /read failed/);
    assert.equal((await db.select().from(problemStatements)).length, 3, "no partial commit");
    assert.equal((await db.select().from(datasetImportRuns)).length, 3);
  } finally { await fixture.close(); }
});

test("dataset import never supersedes a statement from another source (regression)", async () => {
  const { createReasoningService } = await import("../server/reasoning/service");
  const { scriptedModel, source } = await import("./reasoning-fixtures");
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  try {
    await db.insert(cfProblems).values({ key: "c:7101:A", contestId: 7101, index: "A", name: "7101A", type: "PROGRAMMING",
      rating: 1500, inProblemset: true, url: "https://example.invalid/7101/A" });
    const service = createReasoningService(db, pool, fixture.config, scriptedModel().model);
    await service.registerStatement(source("c:7101:A"));
    const report = await importDataset(db, () => [JSON.stringify(row(7101, "A"))], REF);
    const queued = await service.enqueue("c:7101:A", { mode: "mock" });
    assert.notEqual(queued.status, "missing_statement", "the existing statement stays current after an import");
    assert.equal(report.skipped.other_source_present?.count, 1);
    assert.equal(report.statementsInserted, 0);
  } finally { await fixture.close(); }
});

test("import errors never print query parameters (regression)", async () => {
  const { describeImportError } = await import("../server/reasoning/dataset");
  const { DrizzleQueryError } = await import("drizzle-orm/errors");
  const cause = Object.assign(new Error("new row violates check constraint"), { code: "23514", constraint: "problem_test_sets_size_cap" });
  const message = describeImportError(new DrizzleQueryError("insert into problem_statements ...", ["PRIVATE STATEMENT TEXT"], cause));
  assert.doesNotMatch(message, /PRIVATE STATEMENT TEXT|insert into/);
  assert.match(message, /23514/);
  assert.match(message, /problem_test_sets_size_cap/);
});

test("import skips unusable rows by reason, keeps alias rows, marks one current test set, honors revocation", async () => {
  const fixture = await testDatabase();
  const { db } = fixture.database;
  try {
    for (const [contestId, index] of [[7201, "A"], [7201, "B"], [7202, "C"], [7203, "D"], [7203, "E"]] as const) {
      await db.insert(cfProblems).values({ key: `c:${contestId}:${index}`, contestId, index, name: `${contestId}${index}`, type: "PROGRAMMING",
        rating: 1400, inProblemset: true, url: `https://example.invalid/${contestId}/${index}` });
    }
    const lines = [
      JSON.stringify(row(7201, "A", { examples: [] })),                       // bad first row for 7201/A
      JSON.stringify(row(7201, "A")),                                          // later valid row still imports it
      JSON.stringify(row(7201, "B", { description: "x".repeat(70_000) })),     // statement_too_long
      JSON.stringify(row(7202, "C", { description: "has \u0000 nul" })),       // contains_nul
      "[1,2]",                                                                 // invalid_row
      JSON.stringify(row(7203, "D", { aliases: ["7203/E"], generated_tests: 3e9 })), // one row, two catalog problems
    ];
    const report = await importDataset(db, () => lines, REF, { expectedRows: 6 });
    assert.equal(report.skipped.missing_examples?.count, 1);
    assert.equal(report.skipped.duplicate_problem, undefined, "a failed first row never claims the key");
    assert.equal(report.skipped.statement_too_long?.count, 1);
    assert.equal(report.skipped.contains_nul?.count, 1);
    assert.equal(report.skipped.invalid_row?.count, 1);
    assert.equal(report.statementsInserted, 3, "7201/A plus both identities of the 7203 row");
    const meta = await db.select().from(datasetProblems);
    assert.equal(meta.find(m => m.problemKey === "c:7203:E")?.generatedTestsCount, 0, "out-of-range count stored as 0");
    assert.ok(meta.every(m => m.statementId), "metadata records the exact statement version");

    // A new revision with different tests replaces the current set; the old one stays, not current.
    const changed = [JSON.stringify(row(7201, "A", { official_tests: [{ input: "9\n", output: "9\n" }] }))];
    await importDataset(db, () => changed, REF);
    const sets = await db.select().from(problemTestSets).where(eq(problemTestSets.problemKey, "c:7201:A"));
    assert.equal(sets.length, 2);
    assert.equal(sets.filter(s => s.isCurrent).length, 1);
    // Becoming checker-required leaves no current set to judge against (CEO-17).
    await importDataset(db, () => [JSON.stringify(row(7201, "A", { generated_checker: "c" }))], REF);
    assert.equal((await db.select().from(problemTestSets).where(eq(problemTestSets.problemKey, "c:7201:A"))).filter(s => s.isCurrent).length, 0);

    // Revoked content is reported, not counted as unchanged.
    await db.update(problemStatements).set({ revokedAt: new Date() }).where(eq(problemStatements.problemKey, "c:7203:D"));
    const again = await importDataset(db, () => [lines[5]], REF);
    assert.equal(again.skipped.statement_revoked?.count, 1);

    await assert.rejects(importDataset(db, () => lines, REF, { expectedRows: 99 }), /ROW_COUNT_MISMATCH/);
  } finally { await fixture.close(); }
});

test("licensed-dataset statements cannot be registered by hand", async () => {
  const { createReasoningService } = await import("../server/reasoning/service");
  const { scriptedModel, source } = await import("./reasoning-fixtures");
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  try {
    await db.insert(cfProblems).values({ key: "c:7301:A", contestId: 7301, index: "A", name: "7301A", type: "PROGRAMMING",
      rating: 1500, inProblemset: true, url: "https://example.invalid/7301/A" });
    const service = createReasoningService(db, pool, fixture.config, scriptedModel().model);
    const mapped = rowToStatement(row(7301, "A"), "c:7301:A", REF, new Date().toISOString());
    assert.ok(mapped.ok);
    await assert.rejects(service.registerStatement({ ...source("c:7301:A"), ...mapped.value }), /imported only by npm run dataset:import/);
  } finally { await fixture.close(); }
});

test("revocation is per problem, skips retire old data, and the manifest hash and row types are enforced", async () => {
  const { createHash } = await import("node:crypto");
  const fixture = await testDatabase();
  const { db } = fixture.database;
  try {
    for (const [contestId, index] of [[7401, "A"], [7401, "B"], [7401, "C"]] as const) {
      await db.insert(cfProblems).values({ key: `c:${contestId}:${index}`, contestId, index, name: `${contestId}${index}`, type: "PROGRAMMING",
        rating: 1400, inProblemset: true, url: `https://example.invalid/${contestId}/${index}` });
    }
    const current = async (key: string) => (await db.select().from(problemTestSets).where(eq(problemTestSets.problemKey, key))).filter(s => s.isCurrent);
    const t1 = JSON.stringify(row(7401, "A")), t2 = JSON.stringify(row(7401, "A", { official_tests: [{ input: "4\n", output: "4\n" }] }));
    // T1 -> T2 -> T1: the original set becomes the single current one again.
    await importDataset(db, () => [t1], REF);
    const [first] = await current("c:7401:A");
    await importDataset(db, () => [t2], REF);
    await importDataset(db, () => [t1], REF);
    const back = await current("c:7401:A");
    assert.equal(back.length, 1);
    assert.equal(back[0].id, first.id);

    // Revoking any dataset version blocks edited text from a later revision, and retires the old set and link.
    await db.update(problemStatements).set({ revokedAt: new Date() }).where(eq(problemStatements.problemKey, "c:7401:A"));
    const edited = await importDataset(db, () => [JSON.stringify(row(7401, "A", { description: "Edited text." }))], REF);
    assert.equal(edited.skipped.statement_revoked?.count, 1);
    assert.equal(edited.statementsInserted, 0);
    assert.equal((await current("c:7401:A")).length, 0, "a revoked problem keeps no current test set");
    assert.equal((await db.select().from(datasetProblems).where(eq(datasetProblems.problemKey, "c:7401:A")))[0]?.statementId, null);

    // Wrong field types and unpaired surrogates skip the row instead of aborting the run.
    const bad = [JSON.stringify({ ...row(7401, "B"), aliases: 5 }), JSON.stringify(row(7401, "B", { note: "lone \ud800 half" })),
      JSON.stringify(row(7401, "C", { official_tests: null, official_tests_complete: false, official_tests_oversize: true }))];
    const typed = await importDataset(db, () => bad, REF);
    assert.equal(typed.skipped.invalid_row?.count, 1);
    assert.equal(typed.skipped.unpaired_surrogate?.count, 1);
    assert.equal(typed.testsOversize, 1, "oversize rows are counted apart from incomplete ones");
    assert.equal(typed.testsIncomplete, 0);
    assert.equal(textDefect({ ["k\0"]: 1 }), "contains_nul", "keys are checked too");

    // The manifest hash covers every line exactly as the converter wrote it.
    const lines = [JSON.stringify(row(7401, "B"))];
    const good = createHash("sha256").update(lines.map(l => l + "\n").join("")).digest("hex");
    await importDataset(db, () => lines, REF, { expectedRows: 1, expectedSha256: good });
    await assert.rejects(importDataset(db, () => lines, REF, { expectedRows: 1, expectedSha256: "0".repeat(64) }), /HASH_MISMATCH/);
  } finally { await fixture.close(); }
});

test("migration 0008 backfill restores current sets and statement links for rows imported under 0007", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixture = await testDatabase();
  const { db, pool } = fixture.database;
  try {
    for (const [contestId, index] of [[7501, "A"], [7501, "B"]] as const) {
      await db.insert(cfProblems).values({ key: `c:${contestId}:${index}`, contestId, index, name: `${contestId}${index}`, type: "PROGRAMMING",
        rating: 1400, inProblemset: true, url: `https://example.invalid/${contestId}/${index}` });
    }
    await importDataset(db, () => [JSON.stringify(row(7501, "A")), JSON.stringify(row(7501, "B", { generated_checker: "c" }))], REF);
    await importDataset(db, () => [JSON.stringify(row(7501, "A", { official_tests: [{ input: "8\n", output: "8\n" }] }))], REF);
    // Simulate the state right after adding the columns: nothing current, no links.
    await db.update(problemTestSets).set({ isCurrent: false });
    await db.update(datasetProblems).set({ statementId: null });
    await db.insert(problemTestSets).values({ problemKey: "c:7501:B", datasetRef: REF, source: "official", complete: true,
      testCount: 1, totalBytes: 2, testsHash: "b".repeat(64), tests: [{ input: "1", output: "1" }] });
    const sql = await readFile(new URL("../migrations/0008_dataset_current_sets.sql", import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(s => /^(--[^\n]*\n)*UPDATE/.test(s))) {
      await pool.query(statement);
    }
    const sets = await db.select().from(problemTestSets);
    const currentA = sets.filter(s => s.problemKey === "c:7501:A" && s.isCurrent);
    assert.equal(currentA.length, 1);
    assert.equal(currentA[0].testsHash, sets.filter(s => s.problemKey === "c:7501:A").sort((x, y) => +y.createdAt - +x.createdAt)[0].testsHash, "newest set wins");
    assert.equal(sets.filter(s => s.problemKey === "c:7501:B" && s.isCurrent).length, 0, "checker-required problems get no current set");
    assert.ok((await db.select().from(datasetProblems)).every(m => m.statementId), "every dataset problem is linked again");
  } finally { await fixture.close(); }
});
