import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { registerSchema as insertUserSchema } from "@shared/contracts";
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
import { BrainCircuit, Loader2 } from "lucide-react";

export default function AuthPage() {
  const { user, isLoading, error, retry, loginMutation, registerMutation } = useAuth();

  if (isLoading) return <p className="p-8" role="status">Loading your account…</p>;
  if (error) return <div className="space-y-3 p-8"><p role="alert">Unable to load your account.</p><Button onClick={() => void retry()}>Retry</Button></div>;

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
              CF Reasoning Trainer
            </h1>
            <p className="text-muted-foreground text-lg">
              Build your reasoning. Track your personal progress.
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
                    Enter your credentials to access your private workspace.
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

      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-primary/5 p-12 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="relative z-10 max-w-md space-y-7 text-center">
          <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/20 bg-card text-primary shadow-sm"><BrainCircuit className="h-12 w-12" aria-hidden="true" /></span>
          <div className="space-y-3"><h2 className="text-3xl font-bold font-display">Structured Practice</h2><p className="text-lg leading-relaxed text-muted-foreground">Keep your practice reflections private and build a consistent learning habit.</p></div>
        </div>
      </div>
    </div>
  );
}

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

function AuthForm({
  mode,
  onSubmit,
  isLoading,
}: {
  mode: "login" | "register";
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const isRegister = mode === "register";
  const form = useForm<any>({
    resolver: zodResolver(isRegister ? insertUserSchema : loginSchema),
    defaultValues: isRegister ? {
      username: "",
      password: "",
      name: "",
      email: "",
    } : {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {isRegister && (
          <>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
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
        {isRegister && <p className="text-xs text-muted-foreground">Use at least 12 characters for your password (maximum 72 UTF-8 bytes).</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "login" ? "Sign In" : "Create Account"}
        </Button>
      </form>
    </Form>
  );
}

