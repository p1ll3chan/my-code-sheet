import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BrainCircuit, CalendarDays, ChartNoAxesCombined, LayoutDashboard, LogOut, Menu, Settings2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { navigation } from "@/lib/navigation";

const icons = { dashboard: LayoutDashboard, today: CalendarDays, reasoning: BrainCircuit, progress: ChartNoAxesCombined, settings: Settings2 };

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => { setIsMobileOpen(false); }, [location]);
  useEffect(() => {
    if (!isMobileOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsMobileOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isMobileOpen]);

  return <div className="min-h-screen bg-background text-foreground md:flex">
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b bg-card px-4 md:hidden">
      <Link href="/dashboard" className="flex items-center gap-2 text-base font-semibold tracking-tight" aria-label="CF Reasoning Trainer dashboard">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BrainCircuit className="h-4 w-4" /></span>
        <span>CF Reasoning Trainer</span>
      </Link>
      <Button variant="ghost" size="icon" aria-label={isMobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={isMobileOpen} aria-controls="primary-navigation" onClick={() => setIsMobileOpen(open => !open)}>
        {isMobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>
    </header>

    {isMobileOpen && <button type="button" className="fixed inset-0 top-16 z-30 bg-foreground/30 md:hidden" aria-label="Close navigation" onClick={() => setIsMobileOpen(false)} />}
    <aside id="primary-navigation" className={`fixed inset-y-0 top-16 left-0 z-40 flex w-72 flex-col border-r bg-card px-4 py-6 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 md:visible ${isMobileOpen ? "visible translate-x-0" : "invisible -translate-x-full"}`} aria-label="Primary navigation">
      <div className="mb-9 hidden items-center gap-3 px-2 md:flex">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BrainCircuit className="h-5 w-5" /></span>
        <div><p className="text-sm font-bold leading-tight">CF Reasoning Trainer</p><p className="text-xs text-muted-foreground">Personal practice space</p></div>
      </div>
      <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workspace</p>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Training areas">
        {navigation.map(item => {
          const Icon = icons[item.icon];
          const active = location === item.href;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setIsMobileOpen(false)}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{item.label}</span>
          </Link>;
        })}
      </nav>
      <div className="border-t pt-5">
        <div className="mb-4 flex min-w-0 items-center gap-3 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">{user?.username?.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0"><p className="truncate text-sm font-medium">{user?.name}</p><p className="truncate text-xs text-muted-foreground">Private account</p></div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
          <LogOut className="h-4 w-4" aria-hidden="true" />{logoutMutation.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </aside>

    <main id="main-content" className="min-w-0 flex-1"><div className="mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-6 sm:py-10 lg:px-10">{children}</div></main>
  </div>;
}
