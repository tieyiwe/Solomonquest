import { useParams, Link, useLocation } from "wouter";
import { useGetSchoolBySlug, useSubmitApplication } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SchoolApply() {
  const params = useParams();
  const slug = params.slug || "";
  const [_, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: school, isLoading: isSchoolLoading } = useGetSchoolBySlug(slug, {
    query: {
      enabled: !!slug,
    }
  });

  const submitApplication = useSubmitApplication();

  const handleApply = () => {
    if (!user) {
      toast.error("Please log in to submit an application.");
      setLocation("/auth/login");
      return;
    }

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
  };

  if (isSchoolLoading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
          <Skeleton className="h-12 w-3/4 mx-auto mb-4" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </PublicLayout>
    );
  }

  if (!school) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h1 className="text-3xl font-bold mb-4">School not found</h1>
          <p className="text-muted-foreground mb-8">We couldn't find the school you're trying to apply to.</p>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground">
          <Link href={`/schools/${school.slug}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {school.name}
          </Link>
        </Button>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-8 border-b">
            {school.logoUrl ? (
              <div className="mx-auto h-20 w-20 rounded-full overflow-hidden border-4 border-muted mb-4">
                <img src={school.logoUrl} alt={school.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-primary">{school.name.charAt(0)}</span>
              </div>
            )}
            <CardTitle className="text-3xl mb-2">Apply to {school.name}</CardTitle>
            <CardDescription className="text-lg">
              Submit your application to join this academic community.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-8">
            <div className="bg-muted/30 p-6 rounded-lg border border-border">
              <h3 className="font-semibold text-foreground mb-4">Application Details</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex justify-between">
                  <span>Applicant:</span>
                  <span className="font-medium text-foreground">{user ? `${user.firstName} ${user.lastName}` : "Guest User (Please log in)"}</span>
                </li>
                <li className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-medium text-foreground">New Application</span>
                </li>
              </ul>
              
              {!user && (
                <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-md text-sm text-primary text-center">
                  You must create an account or log in before submitting an application.
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            {user ? (
              <Button 
                className="w-full text-lg h-12" 
                onClick={handleApply}
                disabled={submitApplication.isPending}
              >
                {submitApplication.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Submit Application
              </Button>
            ) : (
              <div className="flex gap-4 w-full">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/auth/login">Log In</Link>
                </Button>
                <Button className="w-full" asChild>
                  <Link href="/auth/register">Sign Up</Link>
                </Button>
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground w-full">
              By applying, you agree to the school's terms of admission and code of conduct.
            </p>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}
