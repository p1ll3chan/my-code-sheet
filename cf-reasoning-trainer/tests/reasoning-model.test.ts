import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAIResponsesAdapter, ModelFailure } from "../server/reasoning/model";
import type { Config } from "../server/config";

const config = { AI_ENABLED: "true", AI_DRY_RUN: "false", AI_PROVIDER: "openai",
  OPENAI_API_KEY: "synthetic-test-token", AI_TIMEOUT_MS: 1000, AI_MAX_OUTPUT_TOKENS: 6000 } as Config;

test("Responses adapter preflights the exact model and sends strict, non-stored structured input", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), init: init! });
    if (String(url).endsWith("/models/synthetic-model")) return Response.json({ id: "synthetic-model" });
    return Response.json({ id: "resp_synthetic", status: "completed", model: "synthetic-model",
      output: [{ type: "message", content: [{ type: "output_text", text: '{"fixture":true}' }] }],
      usage: { input_tokens: 42, output_tokens: 9 } });
  };
  const adapter = createOpenAIResponsesAdapter(config, fakeFetch);
  assert.equal(await adapter.available?.("synthetic-model"), true);
  const result = await adapter.generate({ role: "analysis", modelId: "synthetic-model", system: "Derive from statement only",
    input: '{"statement":"synthetic"}' });
  assert.deepEqual(result.value, { fixture: true });
  assert.equal(result.inputTokens, 42);
  assert.equal(result.outputTokens, 9);
  assert.equal(seen.length, 2);
  const body = JSON.parse(String(seen[1].init.body));
  assert.equal(seen[1].init.method, "POST");
  assert.equal(body.model, "synthetic-model");
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.input[1].content, '{"statement":"synthetic"}');
  assert.deepEqual(body.tools, []);
  await adapter.generate({ role: "analysis", modelId: "synthetic-model", system: "Solve only", input: "{}",
    outputFormat: { name: "math_solve", schema: { type: "object", properties: {}, required: [], additionalProperties: false } } });
  const stagedBody = JSON.parse(String(seen[2].init.body));
  assert.equal(stagedBody.text.format.name, "math_solve");
  assert.deepEqual(stagedBody.text.format.schema, { type: "object", properties: {}, required: [], additionalProperties: false });
});

test("Responses adapter treats ambiguous failed requests as potentially charged", async () => {
  const adapter = createOpenAIResponsesAdapter(config, async () => { throw new Error("network interrupted"); });
  await assert.rejects(adapter.generate({ role: "analysis", modelId: "synthetic-model", system: "s", input: "i" }),
    (error: unknown) => error instanceof ModelFailure && error.code === "response_unknown" && error.mayHaveCharged);
});

test("Responses adapter rejects incomplete responses and unavailable account models", async () => {
  const adapter = createOpenAIResponsesAdapter(config, async (url) => String(url).includes("/models/")
    ? Response.json({ error: "not found" }, { status: 404 })
    : Response.json({ status: "incomplete", output: [] }));
  assert.equal(await adapter.available?.("synthetic-model"), false);
  await assert.rejects(adapter.generate({ role: "analysis", modelId: "synthetic-model", system: "s", input: "i" }),
    (error: unknown) => error instanceof ModelFailure && error.code === "response_incomplete" && error.mayHaveCharged);
});
