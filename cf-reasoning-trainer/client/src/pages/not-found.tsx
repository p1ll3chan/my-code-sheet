import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Page not found</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">This page is not part of your training workspace.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Go to dashboard</Link>
        </CardContent>
      </Card>
    </div>
  );
}
