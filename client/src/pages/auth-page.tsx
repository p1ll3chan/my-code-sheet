import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left side - Form */}
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-bold font-display tracking-tight text-primary mb-2">
              CP Tracker
            </h1>
            <p className="text-muted-foreground text-lg">
              Master algorithms. Track your progress. Crush the contest.
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 h-12">
              <TabsTrigger value="login" className="text-base">Login</TabsTrigger>
              <TabsTrigger value="register" className="text-base">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Enter your credentials to access your sheets.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AuthForm
                    mode="login"
                    onSubmit={(data) => loginMutation.mutate(data)}
                    isLoading={loginMutation.isPending}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>
                    Start your competitive programming journey today.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AuthForm
                    mode="register"
                    onSubmit={(data) => registerMutation.mutate(data)}
                    isLoading={registerMutation.isPending}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right side - Visual */}
      <div className="hidden lg:flex flex-col items-center justify-center p-12 bg-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background opacity-50" />
        <div className="relative z-10 max-w-xl text-center space-y-8">
          {/* Abstract visual representation of a graph/chart */}
          <div className="w-full aspect-square max-w-md mx-auto bg-card rounded-2xl shadow-2xl p-8 flex flex-col gap-4 border border-border/50 rotate-3 hover:rotate-0 transition-transform duration-500">
            <div className="h-8 w-1/3 bg-primary/20 rounded-md animate-pulse" />
            <div className="flex-1 bg-muted/50 rounded-lg p-4 grid grid-cols-4 gap-4 items-end">
              <div className="h-[40%] bg-primary/40 rounded-t-md" />
              <div className="h-[60%] bg-primary/60 rounded-t-md" />
              <div className="h-[30%] bg-primary/30 rounded-t-md" />
              <div className="h-[80%] bg-primary rounded-t-md" />
            </div>
            <div className="h-4 w-2/3 bg-muted rounded-md" />
          </div>
          
          <div className="space-y-4">
            <h2 className="text-3xl font-bold font-display">Structured Practice</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Create custom sheets, add problems from any platform, and visualize your daily progress. 
              Consistency is the key to becoming a Grandmaster.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthForm({
  mode,
  onSubmit,
  isLoading,
}: {
  mode: "login" | "register";
  onSubmit: (data: InsertUser) => void;
  isLoading: boolean;
}) {
  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="coder123" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "login" ? "Sign In" : "Create Account"}
        </Button>
      </form>
    </Form>
  );
}
