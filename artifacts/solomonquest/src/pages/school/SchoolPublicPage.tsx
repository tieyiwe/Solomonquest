import { useParams, Link } from "wouter";
import { useGetSchoolBySlug, useListPrograms, useListCourses } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function SchoolPublicPage() {
  const params = useParams();
  const slug = params.slug || "";

  const { data: school, isLoading: isSchoolLoading } = useGetSchoolBySlug(slug, {
    query: {
      enabled: !!slug,
    }
  });

  const { data: courses, isLoading: isCoursesLoading } = useListCourses(
    { published: true },
    {
      query: {
        enabled: !!school?.id,
      }
    }
  );

  if (isSchoolLoading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <Skeleton className="h-12 w-1/2 mb-4" />
          <Skeleton className="h-6 w-1/3 mb-12" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!school) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h1 className="text-3xl font-bold mb-4">School not found</h1>
          <p className="text-muted-foreground mb-8">The school you're looking for doesn't exist or has been removed.</p>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div 
        className="w-full bg-primary py-24 relative overflow-hidden"
        style={{ backgroundColor: school.primaryColor ? `hsl(from ${school.primaryColor} h s l)` : undefined }}
      >
        <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
        <div className="container mx-auto px-4 relative z-10 text-primary-foreground">
          <div className="flex items-center gap-6 mb-6">
            {school.logoUrl && (
              <div className="h-24 w-24 rounded-xl overflow-hidden bg-background border-4 border-background/20 shadow-xl">
                <img src={school.logoUrl} alt={school.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">{school.name}</h1>
              <p className="text-xl opacity-90">Welcome to our academic community.</p>
            </div>
          </div>
          <Button size="lg" variant="secondary" className="mt-4" asChild>
            <Link href={`/schools/${school.slug}/apply`}>Apply Now</Link>
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <h2 className="text-2xl font-bold mb-8">Available Courses</h2>
        
        {isCoursesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Card key={course.id} className="border-border">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline">{course.code}</Badge>
                    {course.term && <Badge variant="secondary" className="bg-secondary/20">{course.term}</Badge>}
                  </div>
                  <CardTitle className="text-xl">{course.title}</CardTitle>
                  {course.teacherName && (
                    <CardDescription>Instructor: {course.teacherName}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm line-clamp-3">
                    {course.description || "No description available."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-muted/30 rounded-xl border border-border">
            <p className="text-muted-foreground text-lg">No public courses available at the moment.</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
