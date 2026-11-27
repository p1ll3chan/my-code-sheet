import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, ListChecks } from "lucide-react";
import { PageHeading, StateCard } from "@/components/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrainingAssignmentCard } from "@/components/training-assignment";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog } from "@/lib/codeforces";
import { useTrainingOverview } from "@/lib/training";
import { apiRequest } from "@/lib/queryClient";

export default function TodaysTraining() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const training = useTrainingOverview(user!.id);
  const catalog = useCatalog(user!.id);
  const [minutes, setMinutes] = useState(30);
  const invalidate = () => cache.invalidateQueries({ queryKey: ["/api/training/overview", user!.id] });
  const plan = useMutation({ mutationFn: async () => { await apiRequest("POST", "/api/training/plan"); }, onSuccess: invalidate });
  const override = useMutation({ mutationFn: async (input: { minutes: number; kind: "break" | "recovery" | "custom" }) => {
    await apiRequest("PUT", "/api/training/day", { day: training.data!.today!.day, ...input });
  }, onSuccess: invalidate });
  function submitAvailability(event: FormEvent) { event.preventDefault(); override.mutate({ minutes, kind: minutes < (training.data?.goal?.dailyMinutes ?? 60) ? "recovery" : "custom" }); }
  const data = training.data;
  return <div className="space-y-8">
    <PageHeading eyebrow="Daily practice" title="Today's Training" description="A deterministic daily session built from your imported public history, current band and available time. Record your own thinking, pauses and outcomes here." />
    {training.isLoading && <p role="status">Loading today's training…</p>}
    {training.isError && <p role="alert">Unable to load your training plan. <Button variant="outline" onClick={() => void training.refetch()}>Retry</Button></p>}
    {data && !data.goal && <StateCard icon={<CalendarDays className="h-5 w-5" />} title="Set a rating goal first" description="Choose your deadline, preferred days and available minutes in Training Settings."><Link href="/settings" className="text-sm font-semibold text-primary hover:underline">Open Training Settings</Link></StateCard>}
    {data?.goal && !data.profile && <StateCard icon={<CalendarDays className="h-5 w-5" />} title="Connect Codeforces history" description="The planner needs your current public rating and attempts before it can select problems."><Link href="/settings" className="text-sm font-semibold text-primary hover:underline">Connect a handle</Link></StateCard>}
    {data?.goal && data.today && <>
      <Card><CardHeader><CardTitle>Today · {data.today.day}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>Available: <strong>{data.today.capacityMinutes} min</strong> · Planned: <strong>{data.today.reservedMinutes} min</strong> · Recorded active work: <strong>{data.today.recordedTodayMinutes} min</strong> · Training band: <strong>{data.today.band}</strong></p><p className="text-muted-foreground">Preferred days and your time zone determine today's capacity. The workload is capped by your available minutes.</p>{data.today.overCapacity && <p role="alert" className="text-destructive">Today's recorded or already-started work exceeds the new availability. No additional tasks will be scheduled.</p>}{data.today.override && <p>Today's override: {data.today.override.kind} ({data.today.override.minutes} min).</p>}
        {data.profile && <Button disabled={plan.isPending} onClick={() => plan.mutate()}>{plan.isPending ? "Planning…" : data.today.generated ? "Recheck today's plan" : "Generate today's plan"}</Button>}
        {plan.isError && <p role="alert" className="text-destructive">{plan.error.message}</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Adjust today</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Take a break, set a recovery day or change today's available time. Pending work is reduced or postponed before it can exceed the new capacity.</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={override.isPending} onClick={() => override.mutate({ minutes: 0, kind: "break" })}>Take a break</Button><Button variant="outline" disabled={override.isPending} onClick={() => override.mutate({ minutes: Math.min(30, data.goal!.dailyMinutes), kind: "recovery" })}>Recovery day</Button></div><form onSubmit={submitAvailability} className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor="today-minutes">Available minutes today</Label><Input id="today-minutes" type="number" min={0} max={600} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></div><Button type="submit" disabled={override.isPending || minutes < 0 || minutes > 600}>Set availability</Button></form>{override.isError && <p role="alert" className="text-sm text-destructive">{override.error.message}</p>}</CardContent></Card>
      {data.today.capacityMinutes === 0 && <StateCard icon={<CalendarDays className="h-5 w-5" />} title="Rest day" description="No essential work is scheduled. Set available minutes above if you choose to train today." />}
      {data.today.generated && data.today.capacityMinutes > 0 && data.today.assignments.length === 0 && <StateCard icon={<ListChecks className="h-5 w-5" />} title="No eligible assignment today" description="The catalog may have no fresh unsolved problem in your current band, or today's workload was completed or postponed. Try again after the catalog or availability changes." />}
      {data.today.assignments.length > 0 && <section className="space-y-4" aria-label="Ordered daily assignments"><h2 className="text-xl font-semibold">Ordered session</h2>{data.today.assignments.map(item => <TrainingAssignmentCard key={item.id} assignment={item} userId={user!.id} serverNow={data.serverNow} />)}</section>}
    </>}
    <Card className="border-border/80 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl"><ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />Shared problem catalog</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{catalog.isLoading && <p role="status">Loading catalog…</p>}{catalog.isError && <p role="alert">Catalog unavailable. <Button variant="outline" onClick={() => void catalog.refetch()}>Retry</Button></p>}{catalog.data && <><p>{catalog.data.eligible} rated 1200–2000 problems available; {catalog.data.unrated} unrated problems excluded.</p><p className="text-muted-foreground">Last refreshed: {catalog.data.refreshedAt ? new Date(catalog.data.refreshedAt).toLocaleString() : "not yet imported"}</p>{catalog.data.lastError && <p role="alert">Last refresh failed; existing catalog data remains.</p>}</>}</CardContent></Card>
  </div>;
}
