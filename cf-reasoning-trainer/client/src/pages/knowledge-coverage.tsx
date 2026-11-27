import { Link } from "wouter";
import { DatabaseZap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useReasoningCoverage } from "@/lib/reasoning";
import { PageHeading, StateCard } from "@/components/page-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function KnowledgeCoverage() {
  const { user } = useAuth();
  const coverage = useReasoningCoverage(user!.id);
  const data = coverage.data;
  return <div className="space-y-7">
    <PageHeading eyebrow="Shared catalog" title="Reasoning knowledge coverage" description="Current catalog and review status for eligible Codeforces problems rated 1200–2000." />
    <Link href="/reasoning" className="text-sm font-medium text-primary hover:underline">Back to Reasoning Profile</Link>
    {coverage.isLoading && <p role="status">Loading persisted coverage…</p>}
    {coverage.isError && <p role="alert">Coverage could not be loaded. <Button variant="outline" onClick={() => void coverage.refetch()}>Retry</Button></p>}
    {data && data.cataloged === 0 && <StateCard icon={<DatabaseZap className="h-5 w-5" />} title="No catalog metadata yet"
      description={data.catalogError ? "The last catalog synchronization failed. No problem metadata is available." : "The official problem metadata catalog has not been synchronized in this database."} />}
    {data && data.cataloged > 0 && <>
      {data.catalogError && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">The last catalog synchronization failed; these counts use the previously saved catalog.</p>}
      <Card><CardHeader><CardTitle>Catalog and statements</CardTitle><CardDescription>Published ratings and operator-registered source grants are separate measures.</CardDescription></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-3">
        <Metric label="Cataloged in problemset" value={data.cataloged} />
        <Metric label="Eligible rated 1200–2000" value={data.eligible} />
        <Metric label="Unrated, excluded" value={data.unrated} />
        <Metric label="Registered shared statements" value={data.authorizedStatements} />
        <Metric label="Awaiting statements" value={data.stages.awaitingStatement} />
        <div><span className="text-muted-foreground">Last successful sync</span><p className="font-medium">{data.lastCatalogSync ? new Date(data.lastCatalogSync).toLocaleString() : "Never"}</p></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Analysis stages</CardTitle><CardDescription>Each eligible problem appears in exactly one stage. The counts below sum to {data.eligible}.</CardDescription></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-4">
        <Metric label="Ready to queue" value={data.stages.ready} />
        <Metric label="Queued" value={data.stages.queued} />
        <Metric label="Analyzing" value={data.stages.analyzing} />
        <Metric label="Needs review" value={data.stages.needsReview} />
        <Metric label="Documented proof review" value={data.stages.verified} />
        <Metric label="Failed or disputed" value={data.stages.failed} />
        <Metric label="Blocked" value={data.stages.blocked} />
        <Metric label="Awaiting statements" value={data.stages.awaitingStatement} />
      </CardContent></Card>
      <p className="text-sm text-muted-foreground">Complete candidate stored: {data.completedAnalysis}. This overlaps the stages above and is not a claim of mathematical correctness. Synthetic fixtures are excluded from these real-problem counts. A registered grant is an operator declaration; its legal basis still requires review.</p>
      <Card><CardHeader><CardTitle>Coverage by official rating</CardTitle><CardDescription>Each eligible catalog count is that row's denominator. Proof review and training readiness are separate.</CardDescription></CardHeader><CardContent className="overflow-x-auto">
        <table className="w-full text-left text-sm"><thead><tr>{["Rating", "Catalog", "Statements", "Analyzed", "Proof reviewed", "Training ready"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{data.byRating?.map(b => <tr key={b.rating}>{[b.rating, b.eligible, b.authorizedStatements, b.completedAnalysis, b.documentedVerification, b.trainingReady].map((n, i) => <td key={i} className="border-t p-2 tabular-nums">{n}</td>)}</tr>)}</tbody></table>
        <p className="mt-4 text-sm">Training ready: {data.trainingReady ?? 0}. Rejected or disputed problems: {data.rejectedProblems ?? 0}. Failed jobs: {data.failedJobs ?? 0}. Historical versions: {data.historicalVersions ?? 0}.</p>
        {!!data.otherRatedEligible && <p>Other published ratings in range: {data.otherRatedEligible}; not rounded into a band.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Snapshot: {data.snapshotAt ? new Date(data.snapshotAt).toLocaleString() : "Unavailable"}.</p>
      </CardContent></Card>
    </>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border p-3"><span className="text-muted-foreground">{label}</span><p className="text-xl font-semibold tabular-nums">{value}</p></div>;
}
