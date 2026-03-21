import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import MentorDashboard from "@/pages/mentor-dashboard";
import SheetsPage from "@/pages/sheets-page";
import SheetDetail from "@/pages/sheet-detail";
import ContestsPage from "@/pages/contests-page";
import ContestDetail from "@/pages/contest-detail";
import NotFound from "@/pages/not-found";

// Wrapper for protected routes
function ProtectedRoute({ 
  component: Component,
  allowedRoles = ["student", "mentor"]
}: { 
  component: React.ComponentType,
  allowedRoles?: string[]
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Redirect to={user.role === "mentor" ? "/mentor" : "/dashboard"} />;
  }

  return <Component />;
}

function RootRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  return <Redirect to={user.role === "mentor" ? "/mentor" : "/dashboard"} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/">
        <RootRoute />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} allowedRoles={["student"]} />
      </Route>
      <Route path="/mentor">
        <ProtectedRoute component={MentorDashboard} allowedRoles={["mentor"]} />
      </Route>
      <Route path="/sheets">
        <ProtectedRoute component={SheetsPage} />
      </Route>
      <Route path="/sheets/:id">
        <ProtectedRoute component={SheetDetail} />
      </Route>
      <Route path="/contests">
        <ProtectedRoute component={ContestsPage} />
      </Route>
      <Route path="/contests/:id">
        <ProtectedRoute component={ContestDetail} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
