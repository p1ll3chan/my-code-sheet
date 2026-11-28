import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const REF = "fbe3f6e903ee854eec2e69e9d96d0306cde59baf";
const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "script/dataset-import.ts", ...args], { cwd: root, encoding: "utf8" });

test("dataset:import refuses bad input before touching the database", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cf-cli-"));
  try {
    const file = path.join(dir, "rows.jsonl");
    await writeFile(file, "{}\n");
    const cases: [string[], RegExp][] = [
      [["import", file, "--dataset-ref", "fbe3f6e"], /ERROR USAGE/],
      [["import", dir, "--dataset-ref", REF], /ERROR FILE_NOT_FOUND/],
      [["import", file, "--dataset-ref", REF], /ERROR MANIFEST_MISSING/],
    ];
    for (const [args, expected] of cases) {
      const run = cli(...args);
      assert.equal(run.status, 2, args.join(" "));
      assert.match(run.stderr, expected);
    }
    await writeFile(`${file}.manifest.json`, JSON.stringify({ revision: REF, rows: 1 }));
    assert.match(cli("import", file, "--dataset-ref", REF).stderr, /ERROR MANIFEST_MISSING/, "a manifest without sha256 is refused");
    await writeFile(`${file}.manifest.json`, JSON.stringify({ revision: "0".repeat(40), rows: 1, sha256: "a".repeat(64) }));
    const mismatch = cli("import", file, "--dataset-ref", REF);
    assert.equal(mismatch.status, 2);
    assert.match(mismatch.stderr, /ERROR REVISION_MISMATCH/);
    assert.equal(cli("--help").status, 0);
  } finally { await rm(dir, { recursive: true }); }
});

const uv = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;
test("dataset-to-jsonl converts parquet with split, NaN cleanup, oversize drop and a manifest", { skip: !uv && "uv not installed" }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cf-conv-"));
  try {
    const data = path.join(dir, "data");
    const make = `
import sys, os, pyarrow as pa, pyarrow.parquet as pq
d = sys.argv[1]; os.makedirs(d)
tests = pa.list_(pa.struct([("input", pa.string()), ("output", pa.string())]))
def write(name, rows):
    pq.write_table(pa.table({"id": [r[0] for r in rows], "time_limit": [r[1] for r in rows],
        "official_tests": pa.array([r[2] for r in rows], type=tests)}), os.path.join(d, name))
write("train-00000-of-00001.parquet", [("1/A", float("nan"), [{"input": "1", "output": "1"}]),
                                       ("1/B", 2.0, [{"input": "x" * (8 * 1024 * 1024), "output": "y"}])])
write("test-00000-of-00001.parquet", [("2/A", 1.0, None)])
`;
    const made = spawnSync("uv", ["run", "--no-project", "--with", "pyarrow", "python", "-I", "-c", make, data], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);
    const out = path.join(dir, "rows.jsonl");
    const run = spawnSync("uv", ["run", "--no-project", "--with", "pyarrow", "python", "-I", path.join(root, "script/dataset-to-jsonl.py"), data, out, REF], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const rows = (await readFile(out, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rows.map(r => [r.id, r.split]), [["2/A", "test"], ["1/A", "train"], ["1/B", "train"]]);
    assert.equal(rows[1].time_limit, null, "NaN becomes null");
    assert.equal(rows[2].official_tests, null);
    assert.equal(rows[2].official_tests_oversize, true);
    assert.equal(rows[2].official_tests_complete, false);
    const manifest = JSON.parse(await readFile(`${out}.manifest.json`, "utf8"));
    assert.equal(manifest.revision, REF);
    assert.equal(manifest.rows, 3);
    assert.equal(manifest.oversizeOfficialTestsDropped, 1);
    assert.match(manifest.sha256, /^[0-9a-f]{64}$/);
    const bad = spawnSync("uv", ["run", "--no-project", "--with", "pyarrow", "python", "-I", path.join(root, "script/dataset-to-jsonl.py"), data, out, "short"], { encoding: "utf8" });
    assert.notEqual(bad.status, 0);
  } finally { await rm(dir, { recursive: true }); }
});
