import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetCourse, getGetCourseQueryKey } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseModulesManager } from "@/components/modules/CourseModulesManager";
import { CourseProgressTable } from "@/components/modules/CourseProgressTable";

/** Admin view of one course's modules and per-student progress. */
export default function AdminCourseModules() {
  const params = useParams();
  const courseId = params.id || "";
  const { data: course, isLoading } = useGetCourse(courseId, {
    query: { enabled: !!courseId, queryKey: getGetCourseQueryKey(courseId) },
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/dashboard/admin/courses">
            <ArrowLeft className="mr-2 h-4 w-4" /> Courses
          </Link>
        </Button>
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{course?.title ?? "Course"}</h1>
          )}
          <p className="text-sm text-muted-foreground">Modules, lessons and student progress</p>
        </div>
        <Tabs defaultValue="modules" className="space-y-4">
          <TabsList>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>
          <TabsContent value="modules">
            <CourseModulesManager courseId={courseId} />
          </TabsContent>
          <TabsContent value="progress">
            <CourseProgressTable courseId={courseId} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
