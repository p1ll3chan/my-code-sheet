import { programSchema, type Program } from "./contracts";

export const VM_VERSION = "bounded-json-vm/1";
export const VM_SPEC = `Optional executable program: bounded-json/1, at most 256 instructions {op,args,value}. value is an integer for const, null otherwise. Registers 0..63; r0 initially holds the input integer array. const [dst] value; length [dst,array]; get [dst,array,indexRegister]; array [dst] creates []; push [array,scalar]; add/sub/mul/div/mod/min/max/lt/eq [dst,a,b]; jump [instructionIndex]; jz [scalar,instructionIndex]; return [scalar]. div floors; mod uses JavaScript signed remainder; comparisons produce 0 or 1. All arithmetic is safe integers, arrays <=1024, execution <=50000 steps. No host code, files, network or other operations. Return null program if unsupported. Your implementation must match your stated algorithm.`;

// Interpret data only. There is no eval, dynamic import, subprocess, or host callback.
export function executeProgram(raw: Program, input: number[]): number {
  const { instructions } = programSchema.parse(raw);
  if (input.length > 1024 || input.some(n => !Number.isSafeInteger(n))) throw new Error("input_limit");
  const regs: Array<number | number[] | undefined> = Array(64);
  regs[0] = [...input];
  const scalar = (r: number) => { const v = regs[r]; if (typeof v !== "number") throw new Error("scalar_required"); return v; };
  const array = (r: number) => { const v = regs[r]; if (!Array.isArray(v)) throw new Error("array_required"); return v; };
  const put = (r: number, v: number | number[]) => { if (r > 63 || (typeof v === "number" && !Number.isSafeInteger(v))) throw new Error("numeric_limit"); regs[r] = v; };
  for (let pc = 0, steps = 0; steps < 50000; steps++) {
    const ins = instructions[pc];
    if (!ins) throw new Error("no_return");
    const [a, b, c] = ins.args;
    const arity = ins.op === "const" || ins.op === "array" || ins.op === "return" || ins.op === "jump" ? 1 : ["length", "push", "jz"].includes(ins.op) ? 2 : 3;
    if (ins.args.length !== arity || (ins.op === "const" ? ins.value === null : ins.value !== null)) throw new Error("invalid_instruction");
    if (ins.args.some((r, i) => r > 63 && !(ins.op === "jump" || (ins.op === "jz" && i === 1)))) throw new Error("register_limit");
    pc++;
    switch (ins.op) {
      case "const": put(a, ins.value!); break;
      case "array": put(a, []); break;
      case "length": put(a, array(b).length); break;
      case "get": { const arr = array(b), index = scalar(c); if (index < 0 || index >= arr.length) throw new Error("index_limit"); put(a, arr[index]); break; }
      case "push": { const arr = array(a); if (arr.length >= 1024) throw new Error("array_limit"); arr.push(scalar(b)); break; }
      case "jump": pc = a; break;
      case "jz": if (!scalar(a)) pc = b; break;
      case "return": return scalar(a);
      default: {
        const x = scalar(b), y = scalar(c);
        const v = ins.op === "add" ? x + y : ins.op === "sub" ? x - y : ins.op === "mul" ? x * y : ins.op === "div" ? Math.floor(x / y)
          : ins.op === "mod" ? x % y : ins.op === "min" ? Math.min(x, y) : ins.op === "max" ? Math.max(x, y) : ins.op === "lt" ? Number(x < y) : Number(x === y);
        put(a, v);
      }
    }
  }
  throw new Error("step_limit");
}
