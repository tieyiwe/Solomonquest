import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateSchool } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";

const setupSchema = z.object({
  name: z.string().min(2, "School name is required"),
  slug: z.string().min(2, "School slug is required").regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
});

type SetupFormValues = z.infer<typeof setupSchema>;

export default function OnboardingSetup() {
  const [_, setLocation] = useLocation();
  const createSchool = useCreateSchool();

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  async function onSubmit(data: SetupFormValues) {
    createSchool.mutate(
      { data: { name: data.name, slug: data.slug } },
      {
        onSuccess: () => {
          toast.success("School created successfully!");
          // User is now an admin, redirect to admin dashboard
          // Note: Wait a bit to let the user profile update its schoolId and role
          setTimeout(() => {
            window.location.href = "/dashboard/admin";
          }, 1000);
        },
        onError: (error: any) => {
          toast.error(error.message || "Failed to create school");
        },
      }
    );
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="text-center space-y-6 mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up your school</h1>
          <p className="text-muted-foreground">
            Create a dedicated environment for your administrators, teachers, and students.
          </p>
        </div>

        <div className="bg-card p-8 rounded-xl border border-border shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Solomon Academy" 
                        {...field} 
                        onChange={(e) => {
                          field.onChange(e);
                          // Auto-generate slug if it's empty or hasn't been manually edited much
                          if (!form.formState.dirtyFields.slug) {
                            form.setValue('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School URL Slug</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <span className="bg-muted px-3 py-2 text-sm text-muted-foreground border border-r-0 border-input rounded-l-md">
                          solomonquest.app/schools/
                        </span>
                        <Input className="rounded-l-none" placeholder="solomon-academy" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createSchool.isPending}>
                {createSchool.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create School
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </PublicLayout>
  );
}
