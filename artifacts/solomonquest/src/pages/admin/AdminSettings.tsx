import { useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetMySchool, useUpdateSchool, getGetMySchoolQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  name: z.string().min(2, "School name is required"),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const { data: school, isLoading: isLoadingSchool } = useGetMySchool();
  const updateSchool = useUpdateSchool();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "",
      primaryColor: "",
      secondaryColor: "",
      logoUrl: "",
    },
  });

  useEffect(() => {
    if (school) {
      form.reset({
        name: school.name || "",
        primaryColor: school.primaryColor || "",
        secondaryColor: school.secondaryColor || "",
        logoUrl: school.logoUrl || "",
      });
    }
  }, [school, form]);

  const onSubmit = (data: SettingsFormValues) => {
    if (!school) return;
    
    updateSchool.mutate(
      { id: school.id, data },
      {
        onSuccess: () => {
          toast.success("School settings updated");
          queryClient.invalidateQueries({ queryKey: getGetMySchoolQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to update settings");
        }
      }
    );
  };

  if (isLoadingSchool) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">School Settings</h1>
          <p className="text-muted-foreground">Manage your school's identity and branding.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>General Identity</CardTitle>
            <CardDescription>
              Update your school's name and public facing details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>School Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/logo.png" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color (Hex)</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-12 p-1 h-10" {...field} value={field.value || "#000000"} />
                            <Input {...field} placeholder="#6E5238" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="secondaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Color (Hex)</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-12 p-1 h-10" {...field} value={field.value || "#000000"} />
                            <Input {...field} placeholder="#B58F5E" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={updateSchool.isPending}>
                  {updateSchool.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
