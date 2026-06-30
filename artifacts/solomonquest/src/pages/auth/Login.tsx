import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [_, setLocation] = useLocation();
  const { user } = useAuth();

  // Redirect logged-in users to their dashboard
  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "super_admin") {
      setLocation("/dashboard/admin");
    } else if (user.role === "teacher") {
      setLocation("/dashboard/teacher");
    } else if (user.role === "student" || user.role === "staff") {
      setLocation("/dashboard/student");
    } else {
      // Logged in but no role yet — go to onboarding
      setLocation("/onboarding/setup");
    }
  }, [user, setLocation]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      toast.success("Successfully logged in");
      // Let AuthContext handle redirect based on role
    } catch (error: unknown) {
      const msg =
        error instanceof Error && error.message
          ? error.message
          : typeof error === "string" && error
            ? error
            : "Failed to log in. Please try again.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8 bg-background flex-1">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center md:text-left">
            <Link href="/">
              <a className="inline-block text-xl font-bold text-primary mb-6">SolomonQuest</a>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your account to continue</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="name@example.com"
                        type="email"
                        autoComplete="email"
                        className="min-h-[44px]"
                        {...field}
                      />
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
                      <Input
                        placeholder="••••••••"
                        type="password"
                        autoComplete="current-password"
                        className="min-h-[44px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full min-h-[48px] text-base" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </Form>

          <div className="text-center md:text-left text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/auth/register">
              <a className="font-semibold text-primary hover:underline">Sign up</a>
            </Link>
          </div>
        </div>
      </div>
      <div className="hidden md:block bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=2073&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-primary-foreground z-10 bg-gradient-to-t from-primary/90 to-transparent">
          <blockquote className="space-y-2 max-w-lg">
            <p className="text-2xl font-medium leading-snug">
              "The platform has completely transformed how our faculty manages coursework and communicates with students."
            </p>
            <footer className="text-sm font-semibold opacity-80">
              Sarah Jenkins, Dean of Academics
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
