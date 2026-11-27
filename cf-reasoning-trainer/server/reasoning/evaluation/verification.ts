import { sha256 } from "../statement";
import { executeProgram, VM_VERSION } from "./vm";
import type { BenchmarkItem } from "./benchmark";
import type { Evidence, Solution } from "./contracts";

export function verify(item: BenchmarkItem, solution: Solution, seed: number): Evidence[] {
  const sampleInputs = item.statement.examples.map(e => JSON.parse(e.input) as number[]);
  const edgeInputs = item.family === "reverse-machine" ? [[0], [1], [item.parameter], [200]]
    : [[0], [1], Array(8).fill(0), Array(8).fill(item.statement.constraints[0].includes("0 or 1") ? 1 : 5)];
  const groups = [{ method: "sample" as const, inputs: sampleInputs }, { method: "edge" as const, inputs: edgeInputs },
    { method: "differential" as const, inputs: item.cases(seed, 64) }];
  return groups.map(({ method, inputs }) => {
    const record: Evidence = { method, outcome: "unsupported", cases: 0, seed, runnerVersion: VM_VERSION,
      programHash: solution.program ? sha256(JSON.stringify(solution.program)) : null, oracleHash: item.oracleHash,
      domain: item.testDomain, counterexample: null,
      limitation: "Finite fixture tests do not prove the theorem, complexity, or prose/program agreement; oracle requires independent human review." };
    if (!solution.program) return record;
    record.outcome = "pass";
    for (const [index, input] of inputs.entries()) {
      const expected = method === "sample" ? Number(item.statement.examples[index].output) : item.oracle(input);
      let actual: number | null = null, error: string | null = null;
      try { actual = executeProgram(solution.program, input); } catch { error = "bounded_execution_failed"; }
      record.cases++;
      if (error || actual !== expected) { record.outcome = error ? "inconclusive" : "fail"; record.counterexample = { input, expected, actual, error }; break; }
    }
    return record;
  });
}
