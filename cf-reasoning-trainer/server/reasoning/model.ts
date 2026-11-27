import { z } from "zod";
import type { Config } from "../config";
import { analysisOutputJsonSchema, critiqueOutputJsonSchema } from "./structured-output";

export type ModelRole = "analysis" | "classification" | "blind" | "critique";
export type ModelCall = { role: ModelRole; modelId: string; system: string; input: string;
  outputFormat?: { name: string; schema: Record<string, unknown> } };
export type ModelAnswer = { value: unknown; responseId: string | null; inputTokens: number | null; outputTokens: number | null; modelId: string };
export interface ModelAdapter { mode: "mock" | "live"; generate(call: ModelCall): Promise<ModelAnswer>; available?(modelId: string): Promise<boolean>; }
export class ModelFailure extends Error {
  constructor(public code: string, public retryable: boolean, public mayHaveCharged: boolean) { super(code); }
}

const responseSchema = z.object({ id: z.string().optional(), status: z.string().optional(), model: z.string().optional(),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional() }).passthrough()).optional(),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).passthrough().nullable().optional(),
}).passthrough();

export function createOpenAIResponsesAdapter(config: Config, fetcher: typeof fetch = fetch): ModelAdapter {
  if (config.AI_ENABLED !== "true" || config.AI_DRY_RUN !== "false" || config.AI_PROVIDER !== "openai" || !config.OPENAI_API_KEY) throw new Error("Live AI is disabled");
  const headers = () => ({ Authorization: `Bearer ${config.OPENAI_API_KEY}`, "Content-Type": "application/json" });
  const endpoint = "https://api.openai.com/v1";
  return { mode: "live",
    async available(modelId) {
      const response = await fetcher(`${endpoint}/models/${encodeURIComponent(modelId)}`, { headers: headers(), signal: AbortSignal.timeout(config.AI_TIMEOUT_MS) });
      if (response.status === 404) return false;
      if (!response.ok) throw new ModelFailure("model_preflight_failed", false, false);
      const body = z.object({ id: z.string() }).passthrough().parse(await response.json());
      return body.id === modelId;
    },
    async generate(call) {
      const payload = { model: call.modelId, input: [{ role: "system", content: call.system }, { role: "user", content: call.input }],
        text: { format: { type: "json_schema", name: call.outputFormat?.name ?? (call.role === "critique" ? "reasoning_critique" : "reasoning_analysis"), strict: true,
          schema: call.outputFormat?.schema ?? (call.role === "critique" ? critiqueOutputJsonSchema : analysisOutputJsonSchema) } },
        max_output_tokens: config.AI_MAX_OUTPUT_TOKENS, store: false, tools: [], truncation: "disabled" };
      let response: Response;
      try { response = await fetcher(`${endpoint}/responses`, { method: "POST", headers: headers(),
        body: JSON.stringify(payload), signal: AbortSignal.timeout(config.AI_TIMEOUT_MS) }); }
      catch { throw new ModelFailure("response_unknown", false, true); }
      if (!response.ok) {
        // The request has reached the provider. Conservatively keep budget reserved;
        // never automatically replay an ambiguous paid call.
        throw new ModelFailure(response.status === 429 ? "rate_limited" : "provider_rejected", false, true);
      }
      let parsed: z.infer<typeof responseSchema>;
      try { parsed = responseSchema.parse(await response.json()); }
      catch { throw new ModelFailure("response_invalid", false, true); }
      if (parsed.status !== "completed") throw new ModelFailure("response_incomplete", false, true);
      const parts = parsed.output?.flatMap(item => item.type === "message" ? item.content ?? [] : [])
        .filter(part => part.type === "output_text" && typeof part.text === "string").map(part => part.text!) ?? [];
      if (!parts.length) throw new ModelFailure("response_no_text", false, true);
      let value: unknown;
      try { value = JSON.parse(parts.join("")); }
      catch { throw new ModelFailure("response_not_json", false, true); }
      return { value, responseId: parsed.id ?? null, modelId: parsed.model ?? call.modelId,
        inputTokens: parsed.usage?.input_tokens ?? null, outputTokens: parsed.usage?.output_tokens ?? null };
    } };
}

export function mockAdapter(answer: (call: ModelCall) => unknown): ModelAdapter {
  return { mode: "mock", available: async () => true,
    async generate(call) { return { value: answer(call), responseId: null, modelId: call.modelId, inputTokens: 0, outputTokens: 0 }; } };
}
