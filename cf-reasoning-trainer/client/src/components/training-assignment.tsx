import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import type { TrainingAssignment } from "@/lib/training";
import type { TrainingEvent } from "@shared/training";

function duration(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function TrainingAssignmentCard({ assignment, userId, serverNow }: { assignment: TrainingAssignment; userId: number; serverNow: string }) {
  const cache = useQueryClient();
  const [observation, setObservation] = useState("");
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const interval = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const event = useMutation({ mutationFn: async (input: TrainingEvent) => {
    await apiRequest("POST", `/api/training/assignments/${assignment.id}/event`, input);
  }, onSuccess: async () => { setObservation(""); await cache.invalidateQueries({ predicate: query => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/training/") }); } });
  const delta = Math.max(0, tick - Date.parse(serverNow));
  const thinking = assignment.thinkingMs + (assignment.status === "thinking" ? delta : 0);
  const implementation = assignment.implementationMs + (assignment.status === "implementing" ? delta : 0);
  const paused = assignment.pausedMs + (["paused_thinking", "paused_implementing"].includes(assignment.status) ? delta : 0);
  const running = ["thinking", "implementing"].includes(assignment.status);
  const isPaused = ["paused_thinking", "paused_implementing"].includes(assignment.status);
  const open = running || isPaused;
  function note(eventValue: FormEvent) { eventValue.preventDefault(); if (observation.trim()) event.mutate({ type: "observation", text: observation.trim() }); }
  return <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2 text-lg"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Priority {assignment.priority}</span>{assignment.url ? <a className="text-primary hover:underline" href={assignment.url} target="_blank" rel="noreferrer">{assignment.name}</a> : assignment.name}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
    <p className="text-muted-foreground">Rating {assignment.rating} · {assignment.purpose} · Thinking budget {assignment.thinkingBudgetMinutes} min · Today&apos;s planned work {assignment.plannedMinutes} min · Status: {assignment.status.replaceAll("_", " ")}</p>
    {assignment.carryFromId && <p className="text-muted-foreground">Resumed from earlier work. Prior observations and assistance are retained.</p>}
    <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center"><div><span className="text-xs text-muted-foreground">Thinking</span><p className="font-mono font-semibold">{duration(thinking)}</p></div><div><span className="text-xs text-muted-foreground">Paused</span><p className="font-mono font-semibold">{duration(paused)}</p></div><div><span className="text-xs text-muted-foreground">Implementing</span><p className="font-mono font-semibold">{duration(implementation)}</p></div></div>
    {assignment.firstObservationAt && <p>First useful observation: {new Date(assignment.firstObservationAt).toLocaleString()} after {duration(assignment.firstObservationThinkingMs ?? 0)} of recorded thinking.</p>}
    {assignment.observation && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3">{assignment.observation}</p>}
    {(assignment.hintUsed || assignment.editorialUsed) && <p>Assistance recorded: {[assignment.hintUsed && "hint", assignment.editorialUsed && "editorial"].filter(Boolean).join(", ")}.</p>}
    <div className="flex flex-wrap gap-2">{assignment.status === "pending" && <Button disabled={event.isPending} onClick={() => event.mutate({ type: "start" })}>Start thinking</Button>}{running && <Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ type: "pause" })}>Pause</Button>}{isPaused && <Button disabled={event.isPending} onClick={() => event.mutate({ type: "resume" })}>Resume</Button>}{assignment.status === "thinking" && <Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ type: "implement" })}>Begin implementation</Button>}</div>
    {open && <><form onSubmit={note} className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1 space-y-1"><Label htmlFor={`observation-${assignment.id}`}>Useful observation</Label><Input id={`observation-${assignment.id}`} value={observation} onChange={value => setObservation(value.target.value)} maxLength={2000} placeholder="Record your own observation" /></div><Button variant="outline" type="submit" disabled={event.isPending || !observation.trim()}>Record</Button></form><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={event.isPending || assignment.hintUsed} onClick={() => event.mutate({ type: "assist", source: "hint" })}>Record hint used</Button><Button variant="outline" disabled={event.isPending || assignment.editorialUsed} onClick={() => event.mutate({ type: "assist", source: "editorial" })}>Record editorial used</Button></div><div className="flex flex-wrap gap-2 border-t pt-3"><Button disabled={event.isPending || assignment.hintUsed || assignment.editorialUsed} onClick={() => event.mutate({ type: "finish", outcome: "solved", independent: true })}>Solved independently</Button><Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ type: "finish", outcome: "solved", independent: false })}>Solved with assistance</Button><Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ type: "finish", outcome: "unsolved", independent: false })}>Unsolved</Button><Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ type: "finish", outcome: "unfinished", independent: false })}>Leave unfinished</Button></div></>}
    {assignment.outcome && <p>Recorded outcome: {assignment.outcome}{assignment.outcome === "solved" ? assignment.independent ? " · self-reported independent" : " · assisted or not independent" : ""}.</p>}
    {event.isError && <p role="alert" className="text-destructive">{event.error.message}</p>}
  </CardContent></Card>;
}
