import { z } from "zod";
import type { Config } from "../../config";
import { sha256 } from "../statement";
import { strictJsonSchema } from "../structured-output";
import { arms, classificationSchema, critiqueSchema, solutionSchema } from "./contracts";
import { benchmark, benchmarkHash, publicStatement } from "./benchmark";
import { EVALUATION_VERSION, prompts } from "./prompts";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) => sha256(canonical(value));
export const optionsSchema = z.object({ fixtureIds: z.array(z.string()).min(1).max(45), arms: z.array(z.enum(arms)).min(1).max(4),
  seed: z.number().int().min(0).max(0xffffffff).default(1729) }).strict();
export type EvaluationOptions = z.infer<typeof optionsSchema>;
export const formats = { solve: strictJsonSchema(solutionSchema), classify: strictJsonSchema(classificationSchema),
  blind: strictJsonSchema(solutionSchema), critique: strictJsonSchema(critiqueSchema) };
export function createPlan(config: Config, mode: "mock" | "live", raw: unknown) {
  const options = optionsSchema.parse(raw);
  options.fixtureIds.sort(); options.arms.sort();
  if (new Set(options.fixtureIds).size !== options.fixtureIds.length || new Set(options.arms).size !== options.arms.length) throw new Error("Duplicate evaluation selection");
  const selected = options.fixtureIds.map(id => { const b = benchmark.find(b => b.id === id); if (!b) throw new Error("Unknown benchmark fixture"); return b; });
  const models = mode === "mock" ? { standard: "mock-standard", strong: "mock-strong" }
    : { standard: config.OPENAI_STANDARD_MODEL ?? null, strong: config.OPENAI_STRONG_MODEL ?? null };
  const prices = { standardInput: config.OPENAI_STANDARD_INPUT_USD_PER_M, standardOutput: config.OPENAI_STANDARD_OUTPUT_USD_PER_M,
    strongInput: config.OPENAI_STRONG_INPUT_USD_PER_M, strongOutput: config.OPENAI_STRONG_OUTPUT_USD_PER_M };
  // These are explicit byte-based planning ceilings, not a model tokenizer claim.
  // Any unexpectedly larger generated stage is blocked before a subsequent call.
  const maxArtifactBytes = config.AI_MAX_OUTPUT_TOKENS * 16;
  const statementBytes = selected.reduce((n, b) => n + Buffer.byteLength(JSON.stringify(publicStatement(b))), 0);
  const overhead = Math.max(...Object.keys(prompts).map(k => Buffer.byteLength(prompts[k as keyof typeof prompts] + JSON.stringify(formats[k as keyof typeof formats])))) + 2000;
  const maxStatementBytes = Math.max(...selected.map(b => Buffer.byteLength(JSON.stringify(publicStatement(b)))));
  const inputBoundPerCall = maxStatementBytes + maxArtifactBytes * 4 + overhead + 12000;
  const routing = { standard: [2, 0], strong: [0, 2], "standard-critique": [2, 2], selective: [2, 4] } as const;
  const standardCalls = selected.length * options.arms.reduce((n, arm) => n + routing[arm][0], 0);
  const strongCalls = selected.length * options.arms.reduce((n, arm) => n + routing[arm][1], 0);
  const attempts = config.AI_MAX_ATTEMPTS;
  const estimatedMicro = Object.values(prices).every(p => p > 0) ? Math.ceil(attempts * (
    standardCalls * (inputBoundPerCall * prices.standardInput + config.AI_MAX_OUTPUT_TOKENS * prices.standardOutput) +
    strongCalls * (inputBoundPerCall * prices.strongInput + config.AI_MAX_OUTPUT_TOKENS * prices.strongOutput))) : null;
  const expectedOutput = Math.min(1800, config.AI_MAX_OUTPUT_TOKENS);
  const scenario = { standardInputTokens: 0, standardOutputTokens: 0, strongInputTokens: 0, strongOutputTokens: 0 };
  for (const item of selected) for (const arm of options.arms) {
    const stages: Array<[keyof typeof prompts, "standard" | "strong"]> = [["solve", arm === "strong" ? "strong" : "standard"], ["classify", arm === "strong" ? "strong" : "standard"]];
    if (arm === "selective") stages.push(["solve", "strong"], ["classify", "strong"]);
    if (arm === "selective" || arm === "standard-critique") stages.push(["blind", "strong"], ["critique", "strong"]);
    for (const [kind, tier] of stages) {
      const base = Math.ceil(Buffer.byteLength(JSON.stringify(publicStatement(item)) + prompts[kind] + JSON.stringify(formats[kind])) / 4) + 500;
      scenario[`${tier}InputTokens`] += base + (kind === "classify" ? expectedOutput : kind === "critique" ? 3 * expectedOutput + 1000 : 0);
      scenario[`${tier}OutputTokens`] += expectedOutput;
    }
  }
  const scenarioMicro = Object.values(prices).every(p => p > 0) ? Math.ceil(scenario.standardInputTokens * prices.standardInput + scenario.standardOutputTokens * prices.standardOutput + scenario.strongInputTokens * prices.strongInput + scenario.strongOutputTokens * prices.strongOutput) : null;
  const body = { version: EVALUATION_VERSION, benchmarkHash, mode, options, models, prices,
    promptHashes: Object.fromEntries(Object.entries(prompts).map(([k, p]) => [k, digest([p, formats[k as keyof typeof formats]])])),
    maxAttempts: attempts, maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS, maxArtifactBytes, timeoutMs: config.AI_TIMEOUT_MS,
    configuredCapMicroUsd: Math.floor(config.AI_SPEND_LIMIT_USD * 1e6),
    estimate: { statementBytes, approximateStatementTokens: Math.ceil(statementBytes / 4), inputBoundPerCall,
      standardCalls, strongCalls, maxCallsWithRetries: (standardCalls + strongCalls) * attempts,
      outputTokenCeiling: (standardCalls + strongCalls) * attempts * config.AI_MAX_OUTPUT_TOKENS,
      inputTokenPlanningCeiling: (standardCalls + strongCalls) * attempts * inputBoundPerCall,
      conservativeMicroUsd: mode === "mock" ? 0 : estimatedMicro,
      planningScenario: { ...scenario, costMicroUsd: mode === "mock" ? 0 : scenarioMicro,
        assumptions: "All selective cases escalate; 1800 output tokens per call (or configured lower maximum), UTF-8 bytes/4 for prompt/schema/statement, 500 envelope tokens, 1000 evidence tokens. No retries. Multiply by maxAttempts for a retry scenario; replace with pilot observations before larger approval." },
      method: "UTF-8 bytes plus explicit stage/schema/envelope allowance; not an exact tokenizer estimate. No discount assumed." } };
  return { ...body, hash: digest(body) };
}
export type EvaluationPlan = ReturnType<typeof createPlan>;
export const approvalSchema = z.object({ planHash: z.string().regex(/^[a-f0-9]{64}$/), approvalId: z.string().min(1),
  approvedBy: z.string().min(1), approvedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  statementAuthorizationReviewed: z.literal(true), modelStructuredOutputsConfirmed: z.literal(true),
  pricingSource: z.string().url(), pricingCheckedAt: z.string().datetime(), maxSpendMicroUsd: z.number().int().positive().safe(),
  maxCases: z.number().int().min(1).max(180) }).strict();
export type Approval = z.infer<typeof approvalSchema>;
export function requireLiveApproval(config: Config, plan: EvaluationPlan, raw: unknown) {
  const approval = approvalSchema.parse(raw);
  if (config.AI_ENABLED !== "true" || config.AI_DRY_RUN !== "false" || config.AI_PROVIDER !== "openai" || !config.OPENAI_API_KEY || /replace|example|placeholder/i.test(config.OPENAI_API_KEY)) throw new Error("Live evaluation disabled or credentials missing");
  if (!plan.models.standard || !plan.models.strong || Object.values(plan.prices).some(p => p <= 0)) throw new Error("Confirmed model IDs and prices required");
  const now = Date.now();
  if (approval.planHash !== plan.hash || approval.approvalId !== config.AI_PAID_APPROVAL_ID ||
    Date.parse(approval.expiresAt) <= now || Date.parse(approval.approvedAt) > now || Date.parse(approval.pricingCheckedAt) > now ||
    now - Date.parse(approval.pricingCheckedAt) > 7 * 86400000 || approval.maxSpendMicroUsd > plan.configuredCapMicroUsd ||
    plan.options.fixtureIds.length * plan.options.arms.length > approval.maxCases) throw new Error("Approval does not cover the current plan");
  const allowed = new Set(config.AI_APPROVED_PROBLEM_KEYS?.split(",").map(s => s.trim()));
  if (plan.options.fixtureIds.some(id => !allowed.has(id))) throw new Error("Evaluation selection outside approved keys");
  return approval;
}
