import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PageHeading, StateCard } from "@/components/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useCfProfile } from "@/lib/codeforces";
import { useTrainingOverview } from "@/lib/training";
import { goalInput, type GoalInput } from "@shared/training";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function GoalEditor({ initial, userId }: { initial: GoalInput | null; userId: number }) {
  const cache = useQueryClient();
  const [form, setForm] = useState<GoalInput>(initial ?? {
    targetRating: 1600, deadline: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10), dailyMinutes: 60,
    trainingDays: [1, 2, 3, 4, 5], intensity: "standard", focus: "balanced", progression: "adaptive",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [invalid, setInvalid] = useState("");
  const save = useMutation({ mutationFn: async (goal: GoalInput) => {
    await apiRequest("PUT", "/api/training/goal", goal);
  }, onSuccess: async () => { setInvalid(""); await cache.invalidateQueries({ queryKey: ["/api/training/overview", userId] }); } });
  function update<K extends keyof GoalInput>(field: K, value: GoalInput[K]) { setForm(current => ({ ...current, [field]: value })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = goalInput.safeParse(form);
    if (!parsed.success) { setInvalid(parsed.error.issues[0]?.message ?? "Check the goal settings"); return; }
    save.mutate(parsed.data);
  }
  return <Card><CardHeader><CardTitle>Rating goal and weekly plan</CardTitle></CardHeader><CardContent>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="target-rating">Target rating</Label><Input id="target-rating" type="number" min={1200} max={2000} value={form.targetRating} onChange={event => update("targetRating", Number(event.target.value))} required /><p className="text-xs text-muted-foreground">Training catalog covers 1200–2000.</p></div>
        <div className="space-y-2"><Label htmlFor="target-deadline">Target date</Label><Input id="target-deadline" type="date" value={form.deadline} onChange={event => update("deadline", event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="daily-minutes">Available minutes per day</Label><Input id="daily-minutes" type="number" min={15} max={600} value={form.dailyMinutes} onChange={event => update("dailyMinutes", Number(event.target.value))} required /></div></div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Preferred training days</legend><div className="flex flex-wrap gap-3">{weekdays.map((label, day) => <label key={day} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={form.trainingDays.includes(day)} onChange={event => update("trainingDays", event.target.checked ? [...form.trainingDays, day].sort() : form.trainingDays.filter(value => value !== day))} />{label}</label>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="training-intensity">Intensity</Label><select id="training-intensity" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.intensity} onChange={event => update("intensity", event.target.value as GoalInput["intensity"])}><option value="light">Light</option><option value="standard">Standard</option><option value="intense">Intense</option></select></div>
        <div className="space-y-2"><Label htmlFor="training-focus">Current focus</Label><select id="training-focus" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.focus} onChange={event => update("focus", event.target.value as GoalInput["focus"])}><option value="balanced">Balanced</option><option value="growth">Growth</option><option value="speed">Speed</option><option value="weakness">Weakness repair</option></select></div>
        <div className="space-y-2"><Label htmlFor="difficulty-progression">Difficulty progression</Label><select id="difficulty-progression" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.progression} onChange={event => update("progression", event.target.value as GoalInput["progression"])}><option value="strict-band">Strict band</option><option value="adaptive">Adaptive within demonstrated band</option></select></div></div>
      <div className="max-w-sm space-y-2"><Label htmlFor="training-timezone">Time zone</Label><Input id="training-timezone" value={form.timeZone} onChange={event => update("timeZone", event.target.value)} maxLength={64} required /><p className="text-xs text-muted-foreground">Use an IANA name such as Asia/Kolkata. Day boundaries use this zone.</p></div>
      <p className="text-sm text-muted-foreground">The planner uses transparent rules and your recorded practice. It does not predict a rating increase.</p>
      <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save training goal"}</Button>
      {save.isSuccess && <p role="status" className="text-sm">Goal saved. Today&apos;s plan will use the new settings.</p>}
      {(invalid || save.isError) && <p role="alert" className="text-sm text-destructive">{invalid || save.error?.message}</p>}
    </form>
  </CardContent></Card>;
}

export default function TrainingSettings() {
  const { user } = useAuth();
  const [handle, setHandle] = useState("");
  const cache = useQueryClient();
  const profile = useCfProfile(user!.id);
  const training = useTrainingOverview(user!.id);
  const sync = useMutation({ mutationFn: async (value: string) => {
    await apiRequest("POST", "/api/codeforces/sync", { handle: value });
  }, onSuccess: async () => { await cache.invalidateQueries({ predicate: query => typeof query.queryKey[0] === "string" && (query.queryKey[0].startsWith("/api/codeforces/") || query.queryKey[0].startsWith("/api/training/")) }); } });
  const syncHandle = handle.trim() || profile.data?.handle || "";
  function submit(event: FormEvent) { event.preventDefault(); sync.mutate(syncHandle); }
  return <div className="space-y-8">
    <PageHeading eyebrow="Personal setup" title="Training Settings" description="Connect public Codeforces history and set a realistic rating goal, availability and training preferences." />
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Account and training preferences">
      <Card className="border-border/80 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl"><UserRound className="h-5 w-5 text-primary" aria-hidden="true" />Account</CardTitle></CardHeader><CardContent><dl className="space-y-4 text-sm"><div><dt className="text-muted-foreground">Name</dt><dd className="mt-1 break-words font-medium">{user!.name}</dd></div><div><dt className="text-muted-foreground">Username</dt><dd className="mt-1 break-words font-medium">{user!.username}</dd></div></dl></CardContent></Card>
      <StateCard icon={<CalendarClock className="h-5 w-5" />} title={training.data?.goal ? `Goal: ${training.data.goal.targetRating} by ${training.data.goal.deadline}` : "Training goal not set"} description={training.data?.goal ? `Current official rating: ${training.data.profile?.currentRating ?? "unrated"}. Estimated readiness: ${training.data.progress?.estimatedReadiness ?? "insufficient practice evidence"}.` : "Set your target rating and date below. Your actual Codeforces rating stays separate from practice readiness."} />
    </section>
    <Card><CardHeader><CardTitle>Codeforces handle</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Import public profile, rating changes and complete available submission history. Entering a handle does not verify that you own it. No source code is requested.</p>
      {profile.isLoading && <p role="status">Loading connected handle…</p>}
      {profile.isError && <p role="alert">Could not load your Codeforces profile. <Button variant="outline" onClick={() => void profile.refetch()}>Retry</Button></p>}
      {profile.data && <p className="text-sm">Current handle: <strong>{profile.data.handle}</strong> · Last synced: {profile.data.lastSyncedAt ? new Date(profile.data.lastSyncedAt).toLocaleString() : "never"}</p>}
      {profile.data?.lastError && <p role="alert" className="text-sm">The last synchronization did not complete. Existing history is retained.</p>}
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="space-y-2"><Label htmlFor="cf-handle">Public handle</Label><Input id="cf-handle" value={handle} onChange={event => setHandle(event.target.value)} minLength={3} maxLength={32} required={!profile.data} autoComplete="off" placeholder={profile.data?.handle ?? "Codeforces handle"} /></div><Button type="submit" disabled={sync.isPending || !/^[A-Za-z0-9_.-]{3,32}$/.test(syncHandle)}>{sync.isPending ? "Synchronizing…" : profile.data ? "Sync or change handle" : "Connect handle"}</Button></form>
      {sync.isError && <p role="alert" className="text-sm text-destructive">{sync.error.message}</p>}
    </CardContent></Card>
    {training.isLoading && <p role="status">Loading training settings…</p>}
    {training.isError && <p role="alert">Could not load training settings. <Button variant="outline" onClick={() => void training.refetch()}>Retry</Button></p>}
    {training.data && <GoalEditor initial={training.data.goal} userId={user!.id} />}
  </div>;
}
