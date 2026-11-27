import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
    <div className="space-y-2"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p></div>
  </header>;
}

export function StateCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return <Card className="border-border/80 shadow-sm"><CardHeader className="space-y-4">
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">{icon}</span>
    <div className="space-y-2"><CardTitle className="text-xl">{title}</CardTitle><CardDescription className="max-w-xl leading-6">{description}</CardDescription></div>
  </CardHeader>{children && <CardContent>{children}</CardContent>}</Card>;
}
