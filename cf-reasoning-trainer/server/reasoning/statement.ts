import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisInputSchema, type AnalysisInput } from "../../docs/design/reasoning-contracts";

export const statementRegistrationSchema = z.object({
  problemKey: z.string().min(1).max(128), locale: z.string().min(2).max(40).default("en"),
  statement: z.string().min(1).max(60_000), inputSpecification: z.string().min(1).max(60_000),
  outputSpecification: z.string().min(1).max(60_000), constraints: z.array(z.string().min(1).max(60_000)).min(1).max(128),
  examples: z.array(z.object({ input: z.string().max(60_000), output: z.string().max(60_000), explanation: z.string().min(1).nullable() }).strict()).min(1).max(128),
  sampleComparison: z.enum(["exact-tokens", "unsupported"]),
  sourceKind: z.enum(["operator-approved", "synthetic-fixture"]), sourceRef: z.string().min(1).max(1000),
  grantRef: z.string().min(1).max(1000), attribution: z.string().min(1).max(1000),
  approvedAt: z.string().datetime(), processingAllowed: z.literal(true), sharingAllowed: z.boolean(),
  scope: z.enum(["shared", "private"]), ownerId: z.number().int().positive().nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.scope === "private") !== (value.ownerId !== null)) ctx.addIssue({ code: "custom", message: "scope/owner mismatch" });
  if (value.sharingAllowed && value.scope !== "shared") ctx.addIssue({ code: "custom", message: "private source cannot be shared" });
  if (value.sourceKind === "operator-approved" && /^synthetic|^fixture/i.test(value.grantRef)) ctx.addIssue({ code: "custom", message: "real source needs a real grant reference" });
});
export type StatementRegistration = z.infer<typeof statementRegistrationSchema>;

export function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function canonicalStatementContent(value: StatementRegistration) {
  // Fixed order; normalize transport newlines without trimming mathematical whitespace.
  const lf = (text: string) => text.replace(/\r\n?/g, "\n");
  return { locale: value.locale, statement: lf(value.statement), inputSpecification: lf(value.inputSpecification),
    outputSpecification: lf(value.outputSpecification), constraints: value.constraints.map(lf),
    examples: value.examples.map(e => ({ input: lf(e.input), output: lf(e.output), explanation: e.explanation === null ? null : lf(e.explanation) })),
    sampleComparison: value.sampleComparison };
}
export function statementHash(value: StatementRegistration) { return sha256(JSON.stringify(canonicalStatementContent(value))); }
export function storedStatementHash(content: ReturnType<typeof canonicalStatementContent>) {
  // PostgreSQL jsonb does not preserve object key order. Rebuild the canonical
  // projection before comparing its hash with the immutable source version.
  return sha256(JSON.stringify({ locale: content.locale, statement: content.statement,
    inputSpecification: content.inputSpecification, outputSpecification: content.outputSpecification,
    constraints: content.constraints, examples: content.examples.map(e => ({ input: e.input, output: e.output, explanation: e.explanation })),
    sampleComparison: content.sampleComparison }));
}
export function buildAnalysisInput(statementId: string, contentHash: string, content: ReturnType<typeof canonicalStatementContent>): AnalysisInput {
  // Never spread a database row into a prompt: metadata, tags, URLs and grants are excluded.
  return analysisInputSchema.parse({ schemaVersion: "analysis-input/0.1", statementVersionRef: `s_${statementId}`,
    contentHash, locale: content.locale, statement: content.statement, inputSpecification: content.inputSpecification,
    outputSpecification: content.outputSpecification, constraints: content.constraints, examples: content.examples });
}
export function validateStatement(input: AnalysisInput) {
  if (!input.examples.length) return { usable: false, reason: "missing_examples" } as const;
  if (input.constraints.some(value => !/\S/.test(value)) || !/\S/.test(input.statement) || !/\S/.test(input.inputSpecification) || !/\S/.test(input.outputSpecification)) {
    return { usable: false, reason: "incomplete_statement" } as const;
  }
  return { usable: true, reason: null } as const;
}
