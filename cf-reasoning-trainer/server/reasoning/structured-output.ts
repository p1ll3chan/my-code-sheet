import { z } from "zod";
import { analysisCandidateSchema, critiqueReportSchema, type AnalysisCandidate, type CritiqueReport } from "../../docs/design/reasoning-contracts";

const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export const analysisRunOutputSchema = strictObject({ candidate: analysisCandidateSchema,
  samplePredictions: z.array(strictObject({ sampleIndex: z.number().int().nonnegative(), output: z.string().max(60_000) })).max(128) });
export type AnalysisRunOutput = z.infer<typeof analysisRunOutputSchema>;

// Translate the approved Zod contract to the documented strict JSON Schema subset.
// Zod remains authoritative for value/refinement checks after the HTTP response.
export function strictJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects) return strictJsonSchema(schema.innerType());
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return { type: "object", properties: Object.fromEntries(Object.entries(shape).map(([key, item]) => [key, strictJsonSchema(item)])),
      required: Object.keys(shape), additionalProperties: false };
  }
  if (schema instanceof z.ZodDiscriminatedUnion) return { anyOf: schema.options.map(strictJsonSchema) };
  if (schema instanceof z.ZodUnion) return { anyOf: schema.options.map(strictJsonSchema) };
  if (schema instanceof z.ZodNullable) return { anyOf: [strictJsonSchema(schema.unwrap()), { type: "null" }] };
  if (schema instanceof z.ZodArray) return { type: "array", items: strictJsonSchema(schema.element) };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { type: typeof schema.value, enum: [schema.value] };
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodNull) return { type: "null" };
  throw new Error(`Unsupported output schema node: ${schema.constructor.name}`);
}

export const analysisOutputJsonSchema = strictJsonSchema(analysisRunOutputSchema);
export const critiqueOutputJsonSchema = strictJsonSchema(critiqueReportSchema);

export function parseAnalysisOutput(value: unknown): AnalysisRunOutput { return analysisRunOutputSchema.parse(value); }
export function parseCritiqueOutput(value: unknown): CritiqueReport { return critiqueReportSchema.parse(value); }
export type { AnalysisCandidate, CritiqueReport };
