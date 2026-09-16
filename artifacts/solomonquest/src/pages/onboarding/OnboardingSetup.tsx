import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { supabase } from "@/lib/supabase";

const requestSchema = z.object({
  name: z.string().min(2, "Your full name is required"),
  phone: z.string().optional(),
  suggestedSchoolName: z.string().min(2, "A suggested school name is required"),
  reason: z.string().optional(),
});

type RequestFormValues = z.infer<typeof requestSchema>;

interface SchoolRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  suggestedSchoolName: string;
  reviewNotes: string | null;
  createdAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? (err as any).message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function OnboardingSetup() {
  const [existingRequest, setExistingRequest] = useState<SchoolRequest | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<SchoolRequest | null>("/api/school-requests/mine")
      .then(setExistingRequest)
      .catch(() => setExistingRequest(null));
  }, []);

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { name: "", phone: "", suggestedSchoolName: "", reason: "" },
  });

  async function onSubmit(data: RequestFormValues) {
    setSubmitting(true);
    try {
      const created = await apiFetch<SchoolRequest>("/api/school-requests", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setExistingRequest(created);
      toast.success("Your request has been submitted for review.");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (existingRequest === undefined) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  if (existingRequest && existingRequest.status !== "rejected") {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 max-w-md text-center space-y-4">
          {existingRequest.status === "pending" ? (
            <>
              <Clock className="h-10 w-10 text-primary mx-auto" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Request submitted</h1>
              <p className="text-muted-foreground">
                Your request to create "{existingRequest.suggestedSchoolName}" is awaiting review by a platform
                administrator. You'll be notified by email once it's been approved.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Request approved!</h1>
              <p className="text-muted-foreground">
                "{existingRequest.suggestedSchoolName}" has been created. Refresh or log back in to access your
                admin dashboard.
              </p>
              <Button onClick={() => (window.location.href = "/dashboard/admin")}>Go to dashboard</Button>
            </>
          )}
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="text-center space-y-6 mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Request a school</h1>
          <p className="text-muted-foreground">
            Tell us a bit about the school you'd like to set up. A platform administrator will review your
            request and follow up.
          </p>
        </div>

        {existingRequest?.status === "rejected" && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-4 mb-6 text-sm">
            <p className="font-semibold flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Your previous request wasn't approved</p>
            {existingRequest.reviewNotes && <p className="mt-1">{existingRequest.reviewNotes}</p>}
            <p className="mt-1">You can submit a new request below.</p>
          </div>
        )}

        <div className="bg-card p-8 rounded-xl border border-border shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="suggestedSchoolName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Suggested School Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Solomon Academy" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason &amp; Goal for This School</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What is this school for, and what are you hoping to achieve with it?"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </PublicLayout>
  );
}
