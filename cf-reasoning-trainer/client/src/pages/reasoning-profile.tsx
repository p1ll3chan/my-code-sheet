import { BrainCircuit, ShieldCheck } from "lucide-react";
import { PageHeading, StateCard } from "@/components/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function ReasoningProfile() {
  return <div className="space-y-8">
    <PageHeading eyebrow="Your learning" title="Reasoning Profile" description="A future view of how you approach problems, based on your recorded work and independently classified reasoning patterns." />
    <StateCard icon={<BrainCircuit className="h-5 w-5" />} title="No reasoning profile yet" description="There are no analyzed training attempts or verified insights to summarize. This page will stay empty until those records exist." />
    <p className="text-sm"><Link href="/knowledge-coverage" className="font-medium text-primary hover:underline">View shared catalog and analysis coverage</Link></p>
    <Card className="border-border/80 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />Evidence first</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">Reasoning strengths and mathematical insights will only appear with their supporting evidence. Codeforces tags and editorials are not used to fill this space.</p></CardContent></Card>
  </div>;
}
