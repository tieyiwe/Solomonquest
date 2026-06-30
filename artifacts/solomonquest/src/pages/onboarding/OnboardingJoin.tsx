import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetSchoolBySlug, useSubmitApplication } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const searchSchema = z.object({
  slug: z.string().min(1, "Please enter a school slug"),
});

export default function OnboardingJoin() {
  const [_, setLocation] = useLocation();
  const [searchSlug, setSearchSlug] = useState<string | null>(null);
  
  const submitApplication = useSubmitApplication();

  const { data: school, isLoading: isSearching, isError, error } = useGetSchoolBySlug(searchSlug || "", {
    query: {
      enabled: !!searchSlug,
      retry: false,
    }
  });

  const form = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: { slug: "" },
  });

  function onSearch(data: z.infer<typeof searchSchema>) {
    setSearchSlug(data.slug);
  }

  function handleApply() {
    if (!school) return;
    
    submitApplication.mutate(
      { data: { schoolId: school.id } },
      {
        onSuccess: () => {
          toast.success(`Successfully applied to ${school.name}!`);
          setLocation("/dashboard/student");
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit application");
        }
      }
    );
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="text-center space-y-6 mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Join a school</h1>
          <p className="text-muted-foreground">
            Enter your school's unique identifier to find and apply to it.
          </p>
        </div>

        <div className="bg-card p-8 rounded-xl border border-border shadow-sm mb-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSearch)} className="space-y-4">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School Slug</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="e.g. solomon-academy" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isSearching}>
                {isSearching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Find School
              </Button>
            </form>
          </Form>
        </div>

        {isError && searchSlug && (
          <div className="text-center p-6 border border-destructive/50 bg-destructive/10 rounded-lg text-destructive">
            School "{searchSlug}" not found. Please check the spelling.
          </div>
        )}

        {school && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>{school.name}</CardTitle>
              <CardDescription>Found school matching "{searchSlug}"</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={handleApply}
                disabled={submitApplication.isPending}
              >
                {submitApplication.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply to Join
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
