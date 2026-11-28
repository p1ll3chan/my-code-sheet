"""Convert the pinned open-r1/codeforces `default` parquet files to JSONL.

One-off conversion so the TypeScript import needs no parquet dependency:

  uv run --no-project --with pyarrow python -I script/dataset-to-jsonl.py \
      .local/datasets/open-r1-codeforces/<revision>/data \
      .local/datasets/open-r1-codeforces/<revision>/codeforces.jsonl <revision>

Reads only the columns the import uses and records each row's split. Writes to a
temporary file and renames it only after success, so an interrupted run never
leaves a truncated JSONL. Official tests over the 8 MB cap are dropped here
(official_tests_oversize: true) so the importer never holds huge rows. Writes
<out>.manifest.json with the revision, row count and sha256 that
`npm run dataset:import` verifies.
"""
import glob
import hashlib
import json
import math
import os
import re
import sys

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

COLUMNS = ["id", "aliases", "contest_id", "index", "title", "description", "input_format", "output_format",
           "interaction_format", "note", "examples", "time_limit", "memory_limit", "editorial", "tags",
           "official_tests", "official_tests_complete", "input_mode", "generated_checker", "generated_tests"]
TEST_SET_CAP_BYTES = 8 * 1024 * 1024  # matches server/reasoning/dataset.ts


def clean(value):
    """NaN/Infinity are not JSON; store them as null, at any depth, instead of failing the run."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    return value


def oversize_rows(batch):
    """Row positions whose official tests exceed the cap, measured in Arrow before any Python copy."""
    if "official_tests" not in batch.schema.names:
        return set()
    column = batch.column("official_tests")
    flat = pc.list_flatten(column)
    if len(flat) == 0:
        return set()
    sizes = None
    for field in ("input", "output"):
        if flat.type.get_field_index(field) < 0:
            continue
        part = pc.fill_null(pc.binary_length(pc.struct_field(flat, field)), 0)
        sizes = part if sizes is None else pc.add(sizes, part)
    if sizes is None:
        return set()
    totals = pa.table({"row": pc.list_parent_indices(column), "bytes": pc.cast(sizes, pa.int64())}) \
        .group_by("row").aggregate([("bytes", "sum")])
    rows, sums = totals.column("row").to_pylist(), totals.column("bytes_sum").to_pylist()
    return {row for row, total in zip(rows, sums) if total > TEST_SET_CAP_BYTES}


def without_official_tests(batch, rows):
    """Null the oversize rows' official_tests column so to_pylist never materializes them."""
    if not rows:
        return batch
    index = batch.schema.get_field_index("official_tests")
    mask = pa.array([i in rows for i in range(batch.num_rows)])
    column = pc.if_else(mask, pa.nulls(batch.num_rows, batch.column(index).type), batch.column(index))
    arrays = [column if i == index else batch.column(i) for i in range(batch.num_columns)]
    return pa.RecordBatch.from_arrays(arrays, schema=batch.schema)


def main(data_dir: str, out_path: str, revision: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        sys.exit("ERROR BAD_REVISION: pass the full 40-character dataset revision")
    files = sorted(glob.glob(f"{data_dir}/*.parquet"))
    if not files:
        sys.exit(f"ERROR NO_PARQUET: no .parquet files in {data_dir}")
    tmp_path = f"{out_path}.tmp"
    digest, rows, oversize = hashlib.sha256(), 0, 0
    try:
        with open(tmp_path, "w", encoding="utf-8") as out:
            for path in files:
                split = "test" if os.path.basename(path).startswith("test-") else "train"
                parquet = pq.ParquetFile(path)
                columns = [c for c in COLUMNS if c in parquet.schema_arrow.names]
                for batch in parquet.iter_batches(columns=columns, batch_size=64):
                    big = oversize_rows(batch)
                    batch = without_official_tests(batch, big)
                    for position, row in enumerate(batch.to_pylist()):
                        row = clean(row)
                        row["split"] = split
                        if position in big:
                            row["official_tests_complete"] = False
                            row["official_tests_oversize"] = True
                            oversize += 1
                        line = json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n"
                        out.write(line)
                        digest.update(line.encode("utf-8"))
                        rows += 1
    except BaseException:
        # Never leave a partial file behind for a later import to find.
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
    os.replace(tmp_path, out_path)
    manifest = {"dataset": "open-r1/codeforces", "revision": revision, "rows": rows, "sha256": digest.hexdigest(),
                "oversizeOfficialTestsDropped": oversize}
    with open(f"{out_path}.manifest.json.tmp", "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=1)
    os.replace(f"{out_path}.manifest.json.tmp", f"{out_path}.manifest.json")
    print(json.dumps({"files": len(files), **manifest, "out": out_path}))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
