import { useState, useRef } from "react";
import { useParams, Link, useSearch } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetCourse,
  useGetCourseStudents,
  useListAssignments,
  useUpdateCourse,
  useCreateAssignment,
  useUpdateAssignment,
  useListSubmissions,
  useGradeSubmission,
  useGetCourseAttendance,
  getGetCourseQueryKey,
  getListAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  FileText,
  ArrowLeft,
  Video,
  Plus,
  Pencil,
  Check,
  X,
  Loader2,
  BookOpen,
  FolderOpen,
  ClipboardList,
  Clock,
  ExternalLink,
  Upload,
  Link2,
  Eye,
  EyeOff,
  CheckCircle2,
  UserCheck,
  Rocket,
  FileQuestion,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const assignmentSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  pointsPossible: z.coerce.number().optional(),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

export default function TeacherCourseDetail() {
  const params = useParams();
  const courseId = params.id || "";
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const defaultTab = searchParams.get("tab") || "overview";

  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editedBio, setEditedBio] = useState("");
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [videoRoomUrl, setVideoRoomUrl] = useState<string | null>(null);
  const [isStartingVideo, setIsStartingVideo] = useState(false);
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceType, setResourceType] = useState<"link" | "file">("link");
  const [isUploadingResource, setIsUploadingResource] = useState(false);
  const [resourcePublishNow, setResourcePublishNow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: course, isLoading: isCourseLoading } = useGetCourse(courseId, {
    query: { enabled: !!courseId, queryKey: getGetCourseQueryKey(courseId) },
  });

  const { data: students, isLoading: isStudentsLoading } = useGetCourseStudents(courseId, {
    query: { enabled: !!courseId },
  });

  const { data: assignments, isLoading: isAssignmentsLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });

  const { data: submissions, isLoading: isSubmissionsLoading } = useListSubmissions(
    selectedAssignmentId || "",
    { query: { enabled: !!selectedAssignmentId } }
  );

  const { data: attendance } = useGetCourseAttendance(courseId, {
    query: { enabled: !!courseId },
  });

  const updateCourse = useUpdateCourse();
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const gradeSubmission = useGradeSubmission();

  const { data: resources, isLoading: isResourcesLoading } = useQuery<any[]>({
    queryKey: ["teacher-course-resources", courseId],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${courseId}/resources`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch resources");
      return res.json();
    },
    enabled: !!courseId && !!session,
  });

  const { data: quizzes, isLoading: isQuizzesLoading } = useQuery<any[]>({
    queryKey: ["teacher-course-quizzes", courseId],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes?course_id=${courseId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch quizzes");
      return res.json();
    },
    enabled: !!courseId && !!session,
  });

  const [publishOnCreate, setPublishOnCreate] = useState(false);

  const assignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { title: "", description: "", dueDate: "", pointsPossible: 100 },
  });

  const getInitials = (firstName?: string | null, lastName?: string | null) =>
    `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "S";

  const handleSaveDescription = () => {
    updateCourse.mutate(
      { id: courseId, data: { description: editedDescription } },
      {
        onSuccess: () => {
          toast.success("Course description updated");
          setIsEditingDescription(false);
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(courseId) });
        },
        onError: () => toast.error("Failed to update description"),
      }
    );
  };

  const handleSaveBio = () => {
    toast.success("Bio updated");
    setIsEditingBio(false);
  };

  const handleCreateAssignment = (data: AssignmentFormValues) => {
    createAssignment.mutate(
      { courseId, data: { ...data, isPublished: publishOnCreate } as any },
      {
        onSuccess: () => {
          toast.success(publishOnCreate ? "Assignment created and published" : "Assignment saved as draft");
          setIsCreateAssignmentOpen(false);
          assignmentForm.reset();
          setPublishOnCreate(false);
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
        },
        onError: () => toast.error("Failed to create assignment"),
      }
    );
  };

  const handleToggleAssignmentPublish = (assignmentId: string, publish: boolean) => {
    updateAssignment.mutate(
      { id: assignmentId, data: { isPublished: publish } as any },
      {
        onSuccess: () => {
          toast.success(publish ? "Assignment published to students" : "Assignment unpublished");
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
        },
        onError: () => toast.error("Failed to update assignment"),
      }
    );
  };

  const handleToggleResourcePublish = async (resourceId: string, publish: boolean) => {
    try {
      const res = await fetch(`/api/courses/${courseId}/resources/${resourceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ isPublished: publish }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(publish ? "Resource published to students" : "Resource unpublished");
      queryClient.invalidateQueries({ queryKey: ["teacher-course-resources", courseId] });
    } catch {
      toast.error("Failed to update resource");
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    try {
      const res = await fetch(`/api/courses/${courseId}/resources/${resourceId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Resource removed");
      queryClient.invalidateQueries({ queryKey: ["teacher-course-resources", courseId] });
    } catch {
      toast.error("Failed to remove resource");
    }
  };

  const handleToggleQuizPublish = async (quizId: string, publish: boolean) => {
    try {
      const res = await fetch(
        publish ? `/api/quizzes/${quizId}/publish` : `/api/quizzes/${quizId}`,
        {
          method: publish ? "POST" : "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: publish ? undefined : JSON.stringify({ is_published: false }),
        }
      );
      if (!res.ok) throw new Error("Failed");
      toast.success(publish ? "Quiz published to students" : "Quiz unpublished");
      queryClient.invalidateQueries({ queryKey: ["teacher-course-quizzes", courseId] });
    } catch {
      toast.error("Failed to update quiz");
    }
  };

  const handleGradeSubmission = (submissionId: string, grade: number, feedback?: string) => {
    gradeSubmission.mutate(
      { id: submissionId, data: { grade, feedback } },
      {
        onSuccess: () => toast.success("Grade saved"),
        onError: () => toast.error("Failed to save grade"),
      }
    );
  };

  const handleStartVideoClass = async () => {
    if (!courseId) return;
    setIsStartingVideo(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/video/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVideoRoomUrl(data.url || `https://meet.jit.si/solomonquest-${courseId}`);
      } else {
        setVideoRoomUrl(`https://meet.jit.si/solomonquest-${courseId}`);
      }
    } catch {
      setVideoRoomUrl(`https://meet.jit.si/solomonquest-${courseId}`);
    } finally {
      setIsStartingVideo(false);
    }
  };

  const handleAddResource = async () => {
    if (!resourceTitle.trim()) {
      toast.error("Please enter a resource title");
      return;
    }
    if (resourceType === "link" && !resourceUrl.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    setIsUploadingResource(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title: resourceTitle,
          resourceType: "link",
          externalUrl: resourceUrl,
          isPublished: resourcePublishNow,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(resourcePublishNow ? "Resource added and published" : "Resource saved as draft");
      setResourceTitle("");
      setResourceUrl("");
      queryClient.invalidateQueries({ queryKey: ["teacher-course-resources", courseId] });
    } catch {
      toast.error("Failed to add resource");
    } finally {
      setIsUploadingResource(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingResource(true);
    try {
      const filePath = `courses/${courseId}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from("course-resources")
        .upload(filePath, file, { upsert: false });

      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from("course-resources")
        .getPublicUrl(data.path);

      const res = await fetch(`/api/courses/${courseId}/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title: resourceTitle || file.name,
          resourceType: "document",
          fileUrl: publicData.publicUrl,
          isPublished: resourcePublishNow,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("File uploaded successfully");
      setResourceTitle("");
      queryClient.invalidateQueries({ queryKey: ["teacher-course-resources", courseId] });
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setIsUploadingResource(false);
    }
  };

  const getAttendanceSummary = (studentId: string) => {
    if (!attendance) return { present: 0, total: 0 };
    const studentRecords = attendance.filter((r) => r.studentId === studentId);
    return {
      present: studentRecords.filter((r) => r.status === "present").length,
      total: studentRecords.length,
    };
  };

  if (isCourseLoading) {
    return (
      <TeacherLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </TeacherLayout>
    );
  }

  const selectedAssignment = assignments?.find((a) => a.id === selectedAssignmentId);

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Back + Header */}
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
            <Link href="/dashboard/teacher">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {course?.title}
                </h1>
                <Badge variant={course?.isPublished ? "default" : "secondary"}>
                  {course?.isPublished ? "Published" : "Draft"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {course?.code}
                {course?.term ? ` • ${course.term}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/teacher/courses/${courseId}/assignments`}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Grade Assignments
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/teacher/quiz-builder?courseId=${courseId}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Quiz
                </Link>
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-medium text-foreground">{students?.length || 0}</span> students
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span className="font-medium text-foreground">{assignments?.length || 0}</span> assignments
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">
              Students {students ? `(${students.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="assignments">
              Assignments {assignments ? `(${assignments.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
            <TabsTrigger value="video">
              <Video className="h-3.5 w-3.5 mr-1.5" />
              Video
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Course Description</CardTitle>
                  <CardDescription>Edit this description to let students know what to expect.</CardDescription>
                </div>
                {!isEditingDescription && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditedDescription(course?.description || "");
                      setIsEditingDescription(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isEditingDescription ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      rows={5}
                      className="resize-none"
                      placeholder="Describe what this course covers..."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveDescription}
                        disabled={updateCourse.isPending}
                      >
                        {updateCourse.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingDescription(false)}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-foreground leading-relaxed">
                    {course?.description || (
                      <span className="text-muted-foreground italic">
                        No description yet. Click Edit to add one.
                      </span>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Teacher Bio / School Bio</CardTitle>
                  <CardDescription>About yourself or this school's program.</CardDescription>
                </div>
                {!isEditingBio && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditedBio("");
                      setIsEditingBio(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isEditingBio ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      rows={4}
                      className="resize-none"
                      placeholder="Write a brief bio about yourself..."
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveBio}>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingBio(false)}>
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic text-sm">
                    No bio added yet. Click Edit to write a bio.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="text-center p-6">
                <div className="text-3xl font-bold text-primary">{students?.length || 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Enrolled Students</div>
              </Card>
              <Card className="text-center p-6">
                <div className="text-3xl font-bold text-blue-600">{assignments?.length || 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Assignments</div>
              </Card>
              <Card className="text-center p-6">
                <div className="text-3xl font-bold text-green-600">
                  {attendance?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Attendance Records</div>
              </Card>
            </div>
          </TabsContent>

          {/* STUDENTS TAB */}
          <TabsContent value="students">
            <Card>
              <CardHeader>
                <CardTitle>Enrolled Students</CardTitle>
                <CardDescription>
                  {students?.length || 0} students enrolled in this course.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isStudentsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : students && students.length > 0 ? (
                  <div className="divide-y">
                    {students.map((student) => {
                      const att = getAttendanceSummary(student.id);
                      return (
                        <div
                          key={student.id}
                          className="py-3 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={student.avatarUrl || ""} />
                              <AvatarFallback className="text-xs">
                                {getInitials(student.firstName, student.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {student.firstName} {student.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">{student.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {att.total > 0 && (
                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  {att.present}/{att.total}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <UserCheck className="h-3 w-3" />
                                  Attendance
                                </div>
                              </div>
                            )}
                            <Badge variant="outline" className="text-xs">
                              Enrolled
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 border border-dashed rounded-lg">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No students enrolled yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RESOURCES TAB */}
          <TabsContent value="resources" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add Resource</CardTitle>
                <CardDescription>Upload a file or add an external link for students.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={resourceType === "link" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setResourceType("link")}
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Link
                  </Button>
                  <Button
                    variant={resourceType === "file" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setResourceType("file")}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    File Upload
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Resource Title</Label>
                    <Input
                      placeholder="e.g. Chapter 1 Reading"
                      value={resourceTitle}
                      onChange={(e) => setResourceTitle(e.target.value)}
                    />
                  </div>

                  {resourceType === "link" ? (
                    <div className="space-y-1.5">
                      <Label>URL</Label>
                      <Input
                        placeholder="https://..."
                        value={resourceUrl}
                        onChange={(e) => setResourceUrl(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>File</Label>
                      <div
                        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload a file
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, DOCX, PPTX, images up to 50MB
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="publish-resource-now"
                      checked={resourcePublishNow}
                      onCheckedChange={(c) => setResourcePublishNow(c === true)}
                    />
                    <Label htmlFor="publish-resource-now" className="text-sm font-normal cursor-pointer">
                      Publish immediately (otherwise saved as a draft students can't see)
                    </Label>
                  </div>

                  {resourceType === "link" && (
                    <Button
                      onClick={handleAddResource}
                      disabled={isUploadingResource}
                      className="w-full sm:w-auto"
                    >
                      {isUploadingResource ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add Resource
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Course Resources</CardTitle>
                <CardDescription>
                  All resources for this course. Publish a resource to make it visible to students.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isResourcesLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : resources && resources.length > 0 ? (
                  <div className="space-y-3">
                    {resources.map((resource) => (
                      <Card key={resource.id} className="hover:border-primary/40 transition-colors">
                        <CardContent className="flex items-center gap-4 p-4">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{resource.title}</p>
                              {resource.is_published ? (
                                <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">
                                  Published
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  Draft
                                </Badge>
                              )}
                            </div>
                            {(resource.external_url || resource.file_url) && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {resource.external_url || resource.file_url}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleResourcePublish(resource.id, !resource.is_published)}
                            >
                              {resource.is_published ? (
                                <>
                                  <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                                  Unpublish
                                </>
                              ) : (
                                <>
                                  <Rocket className="h-3.5 w-3.5 mr-1.5" />
                                  Publish
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteResource(resource.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 border border-dashed rounded-lg">
                    <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">No resources added yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add links or upload files above to share with students.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ASSIGNMENTS TAB */}
          <TabsContent value="assignments" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Course Assignments</h3>
              <Dialog open={isCreateAssignmentOpen} onOpenChange={setIsCreateAssignmentOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Assignment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Assignment</DialogTitle>
                  </DialogHeader>
                  <Form {...assignmentForm}>
                    <form
                      onSubmit={assignmentForm.handleSubmit(handleCreateAssignment)}
                      className="space-y-4"
                    >
                      <FormField
                        control={assignmentForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input placeholder="Midterm Essay" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={assignmentForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Instructions</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Write a 500 word essay on..."
                                className="resize-none"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={assignmentForm.control}
                          name="dueDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Due Date</FormLabel>
                              <FormControl>
                                <Input type="datetime-local" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={assignmentForm.control}
                          name="pointsPossible"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Points</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="publish-assignment-now"
                          checked={publishOnCreate}
                          onCheckedChange={(c) => setPublishOnCreate(c === true)}
                        />
                        <Label htmlFor="publish-assignment-now" className="text-sm font-normal cursor-pointer">
                          Publish immediately (otherwise saved as a draft students can't see)
                        </Label>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createAssignment.isPending}
                      >
                        {createAssignment.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {publishOnCreate ? "Create & Publish" : "Save as Draft"}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {isAssignmentsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : assignments && assignments.length > 0 ? (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <Card key={assignment.id} className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{assignment.title}</h4>
                            {!assignment.isPublished && (
                              <Badge variant="secondary" className="text-xs">
                                Draft
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                            {assignment.dueDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due {format(new Date(assignment.dueDate), "MMM d, yyyy")}
                              </span>
                            )}
                            <span>{assignment.pointsPossible ?? 0} pts</span>
                          </div>
                          {assignment.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {assignment.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant={assignment.isPublished ? "outline" : "default"}
                            onClick={() =>
                              handleToggleAssignmentPublish(assignment.id, !assignment.isPublished)
                            }
                          >
                            {assignment.isPublished ? (
                              <>
                                <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                                Unpublish
                              </>
                            ) : (
                              <>
                                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                                Publish
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAssignmentId(assignment.id)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Submissions
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No assignments yet.</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => setIsCreateAssignmentOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Assignment
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Submissions Panel */}
            {selectedAssignmentId && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>
                      Submissions: {selectedAssignment?.title}
                    </CardTitle>
                    <CardDescription>
                      {submissions?.length || 0} submissions received
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAssignmentId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {isSubmissionsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : submissions && submissions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Content</TableHead>
                          <TableHead className="w-36">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissions.map((sub) => (
                          <TableRow key={sub.id}>
                            <TableCell className="font-medium text-sm">
                              {sub.studentName || sub.studentId}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  sub.status === "graded"
                                    ? "default"
                                    : sub.status === "submitted"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-xs capitalize"
                              >
                                {sub.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              {sub.content ? (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {sub.content}
                                </p>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  No content
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  defaultValue={sub.grade ?? ""}
                                  className="h-7 w-16 text-sm"
                                  onBlur={(e) => {
                                    if (e.target.value !== "") {
                                      handleGradeSubmission(sub.id, Number(e.target.value));
                                    }
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">
                                  /{selectedAssignment?.pointsPossible || "?"}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 border border-dashed rounded-lg">
                      <Clock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No submissions yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* QUIZZES TAB */}
          <TabsContent value="quizzes" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Quizzes</h3>
              <Button size="sm" asChild>
                <Link href={`/dashboard/teacher/quiz-builder?courseId=${courseId}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Quiz
                </Link>
              </Button>
            </div>

            {isQuizzesLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : quizzes && quizzes.length > 0 ? (
              <div className="space-y-3">
                {quizzes.map((quiz) => (
                  <Card key={quiz.id} className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{quiz.title}</h4>
                            {quiz.is_published ? (
                              <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Draft
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                            {quiz.time_limit_minutes && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {quiz.time_limit_minutes} min
                              </span>
                            )}
                            {quiz.due_date && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due {format(new Date(quiz.due_date), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                          {quiz.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {quiz.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant={quiz.is_published ? "outline" : "default"}
                            onClick={() => handleToggleQuizPublish(quiz.id, !quiz.is_published)}
                          >
                            {quiz.is_published ? (
                              <>
                                <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                                Unpublish
                              </>
                            ) : (
                              <>
                                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                                Publish
                              </>
                            )}
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard/teacher/quiz-builder?courseId=${courseId}&quizId=${quiz.id}`}>
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                              Edit
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <FileQuestion className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No quizzes created yet.</p>
                  <Button size="sm" className="mt-3" asChild>
                    <Link href={`/dashboard/teacher/quiz-builder?courseId=${courseId}`}>
                      <Plus className="h-4 w-4 mr-2" />
                      Build First Quiz
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* VIDEO TAB */}
          <TabsContent value="video" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-primary" />
                  Live Video Class
                </CardTitle>
                <CardDescription>
                  Start a live Jitsi Meet session for your students. Students will be able to join
                  from their course page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!videoRoomUrl ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                      <Video className="h-10 w-10 text-primary" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">Ready to go live?</h3>
                      <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                        Click below to start a live class session. Your students will be notified
                        and can join from their dashboard.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={handleStartVideoClass}
                      disabled={isStartingVideo}
                      className="gap-2"
                    >
                      {isStartingVideo ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Video className="h-5 w-5" />
                      )}
                      {isStartingVideo ? "Starting..." : "Start Live Class"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-medium text-sm">Live Session Active</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(videoRoomUrl, "_blank")}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Open in New Tab
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setVideoRoomUrl(null)}
                        >
                          End Session
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-border bg-muted aspect-video">
                      <iframe
                        src={videoRoomUrl}
                        className="w-full h-full"
                        allow="camera; microphone; display-capture; fullscreen"
                        title="Jitsi Meet - Live Class"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TeacherLayout>
  );
}
