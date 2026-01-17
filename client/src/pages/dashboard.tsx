import { useDashboardStats } from "@/hooks/use-stats";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CheckCircle2, ListTodo, Trophy } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <Layout>
        <DashboardSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <h2 className="text-3xl font-bold font-display tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-2">
            Track your competitive programming journey.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Total Problems"
            value={stats?.totalProblems || 0}
            icon={ListTodo}
            description="Added to sheets"
          />
          <StatCard
            title="Solved Total"
            value={stats?.totalSolved || 0}
            icon={Trophy}
            description="Green verdicts"
            trend={stats?.totalProblems ? Math.round((stats.totalSolved / stats.totalProblems) * 100) + "% completion" : undefined}
          />
          <StatCard
            title="Solved Today"
            value={stats?.solvedToday || 0}
            icon={CheckCircle2}
            description="Keep the streak alive!"
            highlight
          />
        </div>

        {/* Chart Section */}
        <Card className="col-span-4 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Problems solved over time</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              {stats?.progress && stats.progress.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.progress}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: 'var(--shadow-md)'
                      }}
                      cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ fill: "hsl(var(--background))", stroke: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-lg">
                  <p>No activity data yet</p>
                  <p className="text-sm">Solve a problem to see your graph!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  highlight, 
  trend 
}: { 
  title: string; 
  value: number; 
  icon: any; 
  description: string; 
  highlight?: boolean; 
  trend?: string;
}) {
  return (
    <Card className={`border-border/50 shadow-sm transition-all hover:shadow-md ${highlight ? "border-primary/50 bg-primary/5" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-display">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
        </p>
        {trend && (
          <div className="mt-2 text-xs font-medium text-primary bg-primary/10 w-fit px-2 py-0.5 rounded-full">
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[400px] w-full rounded-xl" />
    </div>
  );
}
