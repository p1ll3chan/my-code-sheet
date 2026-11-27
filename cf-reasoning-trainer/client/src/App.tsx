import { Switch, Route, Redirect } from "wouter";
import type { ComponentType, ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import TodaysTraining from "@/pages/todays-training";
import ReasoningProfile from "@/pages/reasoning-profile";
import KnowledgeCoverage from "@/pages/knowledge-coverage";
import ProgressHistory from "@/pages/progress-history";
import TrainingSettings from "@/pages/training-settings";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import { navigation, type TrainingRoute } from "@/lib/navigation";

const pages: Record<TrainingRoute, ComponentType> = {
  "/dashboard": Dashboard,
  "/today": TodaysTraining,
  "/reasoning": ReasoningProfile,
  "/progress": ProgressHistory,
  "/settings": TrainingSettings,
};

function ProtectedArea({ children }: { children: ReactNode }) {
  const { user, isLoading, error, retry } = useAuth();
  if (isLoading) return <p className="p-8" role="status">Loading your account…</p>;
  if (error) return <div className="space-y-3 p-8"><p role="alert">Unable to load your account.</p><Button onClick={() => void retry()}>Retry</Button></div>;
  return user ? <Layout key={user.id}>{children}</Layout> : <Redirect to="/auth" />;
}
export default function App() {
  return <QueryClientProvider client={queryClient}><AuthProvider><TooltipProvider><Toaster />
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/"><Redirect to="/dashboard" /></Route>
      <Route path="/knowledge-coverage"><ProtectedArea><KnowledgeCoverage /></ProtectedArea></Route>
      {navigation.map(item => {
        const Page = pages[item.href];
        return <Route key={item.href} path={item.href}><ProtectedArea><Page /></ProtectedArea></Route>;
      })}
      <Route component={NotFound} />
    </Switch>
  </TooltipProvider></AuthProvider></QueryClientProvider>;
}
