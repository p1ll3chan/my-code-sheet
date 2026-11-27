import { arms, failureKinds, rubricKeys, type EvaluationResult, type Review } from "./contracts";

type Call = { actualMicroUsd: number | null; reservedMicroUsd: number; inputTokens: number | null; outputTokens: number | null;
  latencyMs: number | null; status: string; attempt: number };
type Entry = { id: string; fixtureId: string; arm: string; status: string; result: EvaluationResult | null; reviews: Review[]; calls: Call[] };
export function reviewState(result: EvaluationResult, reviews: Review[]) {
  const assessments = reviews.filter(r => r.purpose === "assessment");
  const disagreements = rubricKeys.filter(k => new Set(reviews.map(r => r.judgments[k].verdict)).size > 1);
  const consensus = Object.fromEntries(rubricKeys.map(k => [k, assessments.length < 2 ? "unreviewed"
    : assessments.every(r => r.judgments[k].verdict === "pass") ? "pass"
    : assessments.every(r => r.judgments[k].verdict === "fail") ? "fail" : "unresolved"])) as Record<typeof rubricKeys[number], string>;
  const executionPass = result.evidence.length === 3 && result.evidence.every(e => e.outcome === "pass");
  const contradicted = result.failures.length > 0 || result.critique &&
    [result.critique.algorithm, result.critique.proof, result.critique.classification].some(v => v !== "supported");
  const assessmentAccepted = result.schemaValid && result.solution?.disposition === "complete" && !result.solution.uncertainty.length &&
    !result.classification?.proposedConcepts.length && executionPass && !contradicted &&
    assessments.length >= 2 && assessments.every(r => !r.failures.length && rubricKeys.every(k => r.judgments[k].verdict === "pass"));
  const auditPass = reviews.filter(r => r.purpose === "audit").every(r => !r.failures.length && rubricKeys.every(k => r.judgments[k].verdict === "pass"));
  const accepted = !!assessmentAccepted && auditPass && !disagreements.length;
  return { consensus, disagreements, assessmentAccepted: !!assessmentAccepted, accepted,
    schemaValid: result.schemaValid, sampleTested: result.evidence.some(e => e.method === "sample" && e.outcome === "pass"),
    differentiallyTested: result.evidence.some(e => e.method === "differential" && e.outcome === "pass"),
    proofReviewed: consensus.proof === "pass" && !reviews.some(r => r.judgments.proof.verdict !== "pass") && !contradicted && executionPass,
    humanReviewed: assessments.length >= 2,
    status: accepted ? "accepted-for-evaluation" : reviews.some(r => rubricKeys.some(k => r.judgments[k].verdict === "fail")) || result.evidence.some(e => e.outcome === "fail") ? "rejected" : "needs-review" };
}
export function wilson(pass: number, total: number) {
  if (!total) return null;
  const z = 1.96, p = pass / total, d = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / d, radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius), confidence: 0.95,
    limitation: "Descriptive binomial interval; correlated fixture families violate independence. Not a corpus forecast." };
}
function cost(calls: Call[]) { return { actualMicroUsd: calls.some(c => c.actualMicroUsd === null) ? null : calls.reduce((s, c) => s + c.actualMicroUsd!, 0),
  reservedOrActualMicroUsd: calls.reduce((s, c) => s + (c.actualMicroUsd ?? c.reservedMicroUsd), 0),
  unknownUsageCalls: calls.filter(c => c.actualMicroUsd === null).length }; }
export function summarize(entries: Entry[]) {
  const result = Object.fromEntries(arms.map(arm => {
    const selected = entries.filter(e => e.arm === arm), completed = selected.filter(e => e.result), calls = selected.flatMap(e => e.calls);
    const states = completed.map(e => reviewState(e.result!, e.reviews));
    const metric = (key: typeof rubricKeys[number]) => { const pass = states.filter(s => s.consensus[key] === "pass").length,
      fail = states.filter(s => s.consensus[key] === "fail").length, unresolved = states.filter(s => s.consensus[key] === "unresolved").length;
      return { pass, fail, unresolved, unreviewed: selected.length - pass - fail - unresolved, total: selected.length,
        passFractionOfAll: selected.length ? pass / selected.length : null, passFractionOfAdjudicated: pass + fail ? pass / (pass + fail) : null, interval: wilson(pass, pass + fail) }; };
    const audited = completed.filter(e => reviewState(e.result!, e.reviews).assessmentAccepted && e.reviews.some(r => r.purpose === "audit"));
    const auditPass = audited.filter(e => reviewState(e.result!, e.reviews).accepted).length;
    const accepted = states.filter(s => s.accepted).length, costs = cost(calls);
    return [arm, { scheduled: selected.length, completed: completed.length, blocked: selected.filter(e => e.status === "blocked").length,
      algorithmCorrectness: metric("algorithm"), proofValidity: metric("proof"), primaryInsightAccuracy: metric("primaryInsight"),
      classificationUsefulness: metric("trainingUsefulness"), reasoningClassification: metric("reasoningClassification"),
      secondaryInsightAccuracy: metric("secondaryObservations"),
      falseVerificationRate: { audited: audited.length, falseAcceptances: audited.length - auditPass, fraction: audited.length ? (audited.length - auditPass) / audited.length : null, interval: wilson(audited.length - auditPass, audited.length) },
      verificationPrecision: { audited: audited.length, pass: auditPass, fraction: audited.length ? auditPass / audited.length : null, interval: wilson(auditPass, audited.length) },
      accepted, ...costs, costPerAcceptedMicroUsd: accepted && costs.actualMicroUsd !== null ? costs.actualMicroUsd / accepted : null,
      inputTokens: calls.reduce((s, c) => s + (c.inputTokens ?? 0), 0), outputTokens: calls.reduce((s, c) => s + (c.outputTokens ?? 0),
        0), missingTokenUsageCalls: calls.filter(c => c.inputTokens === null || c.outputTokens === null).length,
      totalLatencyMs: calls.reduce((s, c) => s + (c.latencyMs ?? 0), 0), callCount: calls.length,
      failedCalls: calls.filter(c => c.status !== "completed").length, retryCalls: calls.filter(c => c.attempt > 1).length,
      failureRate: calls.length ? calls.filter(c => c.status !== "completed").length / calls.length : null,
      retryRate: calls.length ? calls.filter(c => c.attempt > 1).length / calls.length : null,
      schemaValid: states.filter(s => s.schemaValid).length, sampleTested: states.filter(s => s.sampleTested).length,
      differentiallyTested: states.filter(s => s.differentiallyTested).length, proofReviewed: states.filter(s => s.proofReviewed).length,
      humanReviewed: states.filter(s => s.humanReviewed).length, disagreementCases: states.filter(s => s.disagreements.length).length }];
  }));
  const paired = entries.filter(e => e.arm === "selective" && e.result).flatMap(e => {
    const base = entries.find(b => b.fixtureId === e.fixtureId && b.arm === "standard" && b.result);
    if (!base || !reviewState(e.result!, e.reviews).humanReviewed || !reviewState(base.result!, base.reviews).humanReviewed) return [];
    return [{ fixtureId: e.fixtureId, escalated: e.result!.escalated, baselineAccepted: reviewState(base.result!, base.reviews).accepted,
      finalAccepted: reviewState(e.result!, e.reviews).accepted, additionalMicroUsd: cost(e.calls).actualMicroUsd === null || cost(base.calls).actualMicroUsd === null ? null : cost(e.calls).actualMicroUsd! - cost(base.calls).actualMicroUsd! }];
  });
  return { byArm: result, escalation: { pairedReviewed: paired.length, pairs: paired, improved: paired.filter(p => !p.baselineAccepted && p.finalAccepted).length,
    regressed: paired.filter(p => p.baselineAccepted && !p.finalAccepted).length, conclusion: "No automatic preference for strong models; inspect paired review outcomes, uncertainty and incremental cost." },
    failureCases: Object.fromEntries(failureKinds.map(kind => [kind, entries.filter(e => [...(e.result?.failures ?? []), ...e.reviews.flatMap(r => r.failures)].some(f => f.kind === kind)).map(e => e.id)])) };
}
