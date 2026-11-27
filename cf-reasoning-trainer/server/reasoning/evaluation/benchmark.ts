import { sha256 } from "../statement";

export const BENCHMARK_VERSION = "original-math-fixtures/1";
export const BANDS = [1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000] as const;
type Family = { id: string; mechanism: string; statement(k: number): string; reference: string;
  oracle(a: number[], k: number): number; inputKind?: "bits" | "target" };
const subsets = (n: number) => Array.from({ length: 2 ** n }, (_, i) => i);
const selected = (mask: number, i: number) => (mask >> i) & 1;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const families: Family[] = [
  { id: "packet-removal", mechanism: "hidden invariant and constructive sufficiency",
    statement: k => `There are piles with the supplied nonnegative sizes. One operation removes exactly ${k} stones from any one pile with enough stones. Return 1 if all piles can become empty, otherwise 0.`,
    reference: "Each pile's residue is preserved. Zero residues are necessary, and removing packets independently proves sufficiency; total divisibility alone fails.",
    oracle: (a, k) => Number(a.every(x => { const reachable = new Set([x]); for (let t = x; t >= k; t--) if (reachable.has(t)) reachable.add(t - k); return reachable.has(0); })) },
  { id: "equal-piles", mechanism: "conservation, characterization, lower bound and construction",
    statement: k => `Transfer one stone between any two piles per operation. All piles must end equal. Each operation costs ${k}. Return minimum total cost, or -1 if impossible.`,
    reference: "Conserved sum determines the target; integrality is necessary. Total surplus is a lower bound and matching surplus to deficits attains it.",
    oracle: (a, k) => { const total = sum(a); if (total % a.length) return -1; const target = total / a.length;
      // Exhaust all possible final common sizes under conservation, then the transport lower bound.
      for (let v = 0; v <= total; v++) if (v * a.length === total) return a.reduce((s, x) => s + Math.abs(x - target), 0) / 2 * k;
      return -1; } },
  { id: "window-toggle", mechanism: "forced extremal choice and multi-observation parity",
    inputKind: "bits", statement: k => `You may invert any ${k} consecutive bits in the supplied line. Return the minimum number of operations to make every bit zero, or -1.`,
    reference: "At the leftmost undecided position the decision to start a window is forced. Repeated toggles cancel in pairs; the final short suffix checks sufficiency.",
    oracle: (a, k) => { const start = a.reduce((m, x, i) => m | (x << i), 0), queue = [[start, 0]], seen = new Set([start]);
      for (let p = 0; p < queue.length; p++) { const [state, d] = queue[p]; if (!state) return d;
        for (let i = 0; i + k <= a.length; i++) { const next = state ^ (((1 << k) - 1) << i); if (!seen.has(next)) { seen.add(next); queue.push([next, d + 1]); } } } return -1; } },
  { id: "subarray-residue", mechanism: "counting transformation",
    statement: k => `Return the number of nonempty contiguous subarrays whose sum is divisible by ${k}.`,
    reference: "A subarray difference is divisible exactly when its two prefix residues agree. Include the empty prefix and count pairs, not individual prefixes.",
    oracle: (a, k) => { let result = 0; for (let l = 0; l < a.length; l++) for (let r = l + 1; r <= a.length; r++) result += Number(sum(a.slice(l, r)) % k === 0); return result; } },
  { id: "reverse-machine", mechanism: "reverse operations and disjoint predecessors", inputKind: "target",
    statement: k => `Start at integer ${k}. Each operation either doubles the number or appends decimal digit 1. The input contains one target. Return the fewest operations to reach it, or -1.`,
    reference: "In reverse, even numbers can only come from doubling, odd numbers ending in 1 only from appending. Both operations strictly increase positive values, which bounds search.",
    oracle: (a, k) => { const target = a[0], q = [[k, 0]], seen = new Set([k]); for (let i = 0; i < q.length; i++) {
      const [x, d] = q[i]; if (x === target) return d; for (const y of [2 * x, 10 * x + 1]) if (y <= target && !seen.has(y)) { seen.add(y); q.push([y, d + 1]); } } return -1; } },
  { id: "interval-packing", mechanism: "proof-based greedy exchange",
    statement: k => `Each supplied number s defines a half-open interval [s,s+${k}). Choose as many pairwise nonoverlapping intervals as possible. Duplicates are separate intervals. Return the maximum count.`,
    reference: "An earliest-finishing first interval can replace an optimal first choice without reducing the remaining feasible choices. Touching endpoints do not overlap.",
    oracle: (a, k) => Math.max(...subsets(a.length).filter(m => a.every((x, i) => !selected(m, i) || a.every((y, j) => j <= i || !selected(m, j) || Math.abs(x - y) >= k))).map(m => a.filter((_, i) => selected(m, i)).length)) },
  { id: "spaced-selection", mechanism: "state sufficiency and conventional dynamic programming",
    statement: k => `Select positions from the supplied weight array so every two selected indices differ by at least ${k}. Return maximum weight sum; selecting none is allowed.`,
    reference: "After choosing the last position i, only the prefix ending at i-k remains. The state summarizes a whole family of subsets; choosing the largest individual weight can block a better pair.",
    oracle: (a, k) => Math.max(...subsets(a.length).filter(m => a.every((_, i) => !selected(m, i) || a.every((_, j) => j <= i || !selected(m, j) || j - i >= k))).map(m => sum(a.filter((_, i) => selected(m, i))))) },
  { id: "circular-selection", mechanism: "decomposition with boundary-dependent observations",
    statement: k => `The weights lie on a circle. Select some positions, with no cyclic run of ${k} consecutive selected positions. If the circle has fewer than ${k} positions there is no restriction. Return maximum total weight.`,
    reference: "A line-state recurrence loses information across the boundary. Condition on the first k-1 decisions or enumerate boundary states, and check wraparound runs.",
    oracle: (a, k) => Math.max(...subsets(a.length).filter(m => a.length < k || a.every((_, i) => Array.from({ length: k }, (_, j) => selected(m, (i + j) % a.length)).some(x => !x))).map(m => sum(a.filter((_, i) => selected(m, i))))) },
  { id: "subset-residue", mechanism: "state compression and counting",
    statement: k => `Return, modulo 1000000007, the number of subsets of positions with sum divisible by ${k}, including the empty subset. Equal values at different positions are distinct choices.`,
    reference: "Residue is sufficient state for extension by a new item. Update from the previous layer to avoid using an item twice; distinguish subsets of positions from distinct sums.",
    oracle: (a, k) => subsets(a.length).filter(m => sum(a.filter((_, i) => selected(m, i))) % k === 0).length },
  { id: "minimax-partition", mechanism: "feasibility reduction, greedy proof, monotonicity",
    statement: k => `Partition the array into at most ${k} nonempty contiguous blocks. Return the smallest achievable maximum block sum. All weights are nonnegative.`,
    reference: "A bound induces a feasibility problem. Extending each block as far as possible minimizes block count under that bound; nonnegativity is essential for the exchange argument and monotonic feasibility.",
    oracle: (a, k) => { let best = Infinity; for (const m of subsets(a.length - 1)) {
      let blocks = 1, current = a[0], worst = 0; for (let i = 1; i < a.length; i++) { if (selected(m, i - 1)) { blocks++; worst = Math.max(worst, current); current = 0; } current += a[i]; }
      if (blocks <= k) best = Math.min(best, Math.max(worst, current)); } return best; } },
  { id: "rotation-mismatch", mechanism: "structural reduction and misleading similarity",
    statement: k => `Sort a copy of the array in nondecreasing order. Rotate the original array cyclically by any amount, then replace values to equal the sorted copy. Each replacement costs ${k}. Return minimum cost.`,
    reference: "Only cyclic rotations are free, not arbitrary permutations. Each fixed rotation costs its mismatch count; inversion count or counting globally misplaced values solves a different problem.",
    oracle: (a, k) => { const target = [...a].sort((x, y) => x - y); return Math.min(...a.map((_, shift) => a.reduce((s, _x, i) => s + Number(a[(i + shift) % a.length] !== target[i]), 0))) * k; } },
  { id: "residue-pairs", mechanism: "equivalence classes and ordered double counting",
    statement: k => `Return the number of ordered pairs of distinct indices (i,j) such that a[i]-a[j] is divisible by ${k}.`,
    reference: "Residue classes characterize admissible pairs. A class of size c contributes c(c-1), not c choose 2 or c squared.",
    oracle: (a, k) => a.reduce((s, x, i) => s + a.filter((y, j) => i !== j && (x - y) % k === 0).length, 0) },
  { id: "zero-xor-cuts", mechanism: "multi-observation invariant and counting characterization", inputKind: "bits",
    statement: k => `Split the bit array into exactly ${k} nonempty contiguous segments, each with XOR zero. Return the number of ways to choose the cuts, modulo 1000000007.`,
    reference: "Every selected boundary must have zero prefix XOR, and total XOR must be zero. Internal zero-prefix positions choose k-1 cuts; total parity alone is insufficient.",
    oracle: (a, k) => { let ways = 0; for (const m of subsets(a.length - 1)) { let blocks = 1, x = a[0], valid = true;
      for (let i = 1; i < a.length; i++) { if (selected(m, i - 1)) { blocks++; valid &&= x === 0; x = 0; } x ^= a[i]; }
      ways += Number(valid && x === 0 && blocks === k); } return ways; } },
  { id: "cover-points", mechanism: "extremal anchoring and constructive greedy",
    statement: k => `Cover all supplied integer points by closed real intervals of length ${k}. Return the minimum number of intervals.`,
    reference: "An interval covering the leftmost uncovered point can shift its left endpoint to that point without losing any required point to its left. This attains a forced lower bound recursively.",
    oracle: (a, k) => { let best = a.length; for (const mask of subsets(a.length)) {
      const starts = a.filter((_, i) => selected(mask, i)); if (a.every(x => starts.some(s => s <= x && x <= s + k))) best = Math.min(best, starts.length); } return best; } },
  { id: "cancel-runs", mechanism: "invariant normal form and local versus global structure",
    statement: k => `Repeatedly delete any run of exactly ${k} equal adjacent values (a longer run permits deleting a length-${k} portion). Return the minimum possible length after any number of deletions.`,
    reference: "Deleting a run can merge previously separated equal values. A residual-run stack computes a candidate normal form; confluence or a separate optimality proof is necessary, rather than simply asserting greedy correctness.",
    oracle: (a, k) => { const memo = new Map<string, number>(); const go = (s: number[]): number => { const key = s.join(","); if (memo.has(key)) return memo.get(key)!;
      let best = s.length; for (let i = 0; i + k <= s.length; i++) if (s.slice(i, i + k).every(x => x === s[i])) best = Math.min(best, go([...s.slice(0, i), ...s.slice(i + k)]));
      memo.set(key, best); return best; }; return go(a); } },
];

export type BenchmarkItem = { id: string; family: string; stratum: number; publishedRating: null; sourceKind: "original-fixture";
  authorization: string; mechanism: string; statement: { statement: string; inputSpecification: string; outputSpecification: string; constraints: string[]; examples: { input: string; output: string }[] };
  referenceForReviewOnly: string; parameter: number; testDomain: string; oracle(input: number[]): number; cases(seed: number, count: number): number[][]; hash: string; oracleHash: string };

export const benchmark: BenchmarkItem[] = families.flatMap((f, familyIndex) => [2, 3, 4].map((k, variant) => {
  const id = `original-${f.id}-${k}`;
  const input = f.inputKind === "bits" ? [1, 1, 0, 1] : f.inputKind === "target" ? [2 * k] : [2, 1, 3, 0];
  const oracle = (a: number[]) => {
    if (a.length < 1 || a.length > (f.inputKind === "target" ? 1 : 8) || a.some(x => !Number.isSafeInteger(x) || x < 0 || x > (f.inputKind === "target" ? 200 : f.inputKind === "bits" ? 1 : 5))) throw new Error("Outside bounded oracle domain");
    return f.oracle(a, k);
  };
  const statement = { statement: f.statement(k), inputSpecification: "A JSON array of integers; positions are zero-based.", outputSpecification: "One integer answer.",
    constraints: f.inputKind === "target" ? ["Exactly one target integer, from 0 through 1000000000000."] : [`Array length 1 through ${f.id === "rotation-mismatch" ? 2000 : 200000}. Values ${f.inputKind === "bits" ? "0 or 1" : "0 through 1000000000"}.`],
    examples: [{ input: JSON.stringify(input), output: String(oracle(input)) }] };
  const descriptor = { id, family: f.id, stratum: BANDS[Math.floor((familyIndex * 3 + variant) / 5)], publishedRating: null,
    sourceKind: "original-fixture", authorization: "Original project fixture text and implementation; project MIT license. No Codeforces statement.",
    mechanism: f.mechanism, statement, referenceForReviewOnly: f.reference, parameter: k,
    testDomain: f.inputKind === "target" ? "One target from 0 through 200" : `Length 1..8, values ${f.inputKind === "bits" ? "0..1" : "0..5"}` } as const;
  return { ...descriptor, oracle, hash: sha256(JSON.stringify(descriptor)), oracleHash: sha256(f.oracle.toString() + k),
    cases(seed: number, count: number) { let state = seed >>> 0; const random = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state >>> 16) % n; };
      return Array.from({ length: count }, () => f.inputKind === "target" ? [random(201)] : Array.from({ length: 1 + random(8) }, () => random(f.inputKind === "bits" ? 2 : 6))); } };
}));
export const benchmarkHash = sha256(BENCHMARK_VERSION + benchmark.map(b => b.hash + b.oracleHash).join(""));
export function publicStatement(item: BenchmarkItem) { return structuredClone(item.statement); }
export function manifest() { return { version: BENCHMARK_VERSION, hash: benchmarkHash, count: benchmark.length,
  limitation: "45 original fixture variants in 15 correlated families. Strata are reserved evaluation slots, not estimated or official Codeforces ratings. No real-world quality inference.",
  items: benchmark.map(({ id, family, stratum, publishedRating, sourceKind, authorization, mechanism, statement, hash }) => ({ id, family, stratum, publishedRating, sourceKind, authorization, mechanism, statement, hash })) }; }
