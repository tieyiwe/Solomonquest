import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Switch, Route, useParams, useLocation } from "wouter";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import NotFound from "@/pages/not-found";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const OnboardingSetup = lazy(() => import("@/pages/onboarding/OnboardingSetup"));
const OnboardingJoin = lazy(() => import("@/pages/onboarding/OnboardingJoin"));
const SchoolPublicPage = lazy(() => import("@/pages/school/SchoolPublicPage"));
const SchoolApply = lazy(() => import("@/pages/school/SchoolApply"));

const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminCourses = lazy(() => import("@/pages/admin/AdminCourses"));
const AdminCourseModules = lazy(() => import("@/pages/admin/AdminCourseModules"));
const AdminTuition = lazy(() => import("@/pages/admin/AdminTuition"));
const AdminAccounting = lazy(() => import("@/pages/admin/AdminAccounting"));
const AdminPrograms = lazy(() => import("@/pages/admin/AdminPrograms"));
const AdminTerms = lazy(() => import("@/pages/admin/AdminTerms"));
const AdminAdmissions = lazy(() => import("@/pages/admin/AdminAdmissions"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminResources = lazy(() => import("@/pages/admin/AdminResources"));
const AdminReminders = lazy(() => import("@/pages/admin/AdminReminders"));
const AdminSchoolBranding = lazy(() => import("@/pages/admin/AdminSchoolBranding"));

const TeacherOverview = lazy(() => import("@/pages/teacher/TeacherOverview"));
const TeacherCourseDetail = lazy(() => import("@/pages/teacher/TeacherCourseDetail"));
const TeacherAssignments = lazy(() => import("@/pages/teacher/TeacherAssignments"));
const TeacherGradebook = lazy(() => import("@/pages/teacher/TeacherGradebook"));
const TeacherQuizBuilder = lazy(() => import("@/pages/teacher/TeacherQuizBuilder"));
const TeacherAnalytics = lazy(() => import("@/pages/teacher/TeacherAnalytics"));
const TeacherAttendance = lazy(() => import("@/pages/teacher/TeacherAttendance"));
const TeacherReminders = lazy(() => import("@/pages/teacher/TeacherReminders"));
const CalendarPage = lazy(() => import("@/pages/calendar/CalendarPage"));
const TeacherResources = lazy(() => import("@/pages/teacher/TeacherResources"));

const ParentOverview = lazy(() => import("@/pages/parent/ParentOverview"));

const StudentOverview = lazy(() => import("@/pages/student/StudentOverview"));
const StudentCourseDetail = lazy(() => import("@/pages/student/StudentCourseDetail"));
const StudentAssignments = lazy(() => import("@/pages/student/StudentAssignments"));
const StudentQuizTake = lazy(() => import("@/pages/student/StudentQuizTake"));
const StudentTranscript = lazy(() => import("@/pages/student/StudentTranscript"));
const StudentQuizzes = lazy(() => import("@/pages/student/StudentQuizzes"));
const StudentTuition = lazy(() => import("@/pages/student/StudentTuition"));
const TranscriptVerifyPage = lazy(() => import("@/pages/transcripts/TranscriptVerifyPage"));
const StudentProfilePage = lazy(() => import("@/pages/dashboard/StudentProfilePage"));
const MyProfilePage = lazy(() => import("@/pages/profile/MyProfilePage"));

const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
const ForumPage = lazy(() => import("@/pages/forum/ForumPage"));
const ForumTopicPage = lazy(() => import("@/pages/forum/ForumTopicPage"));
const NotificationPreferences = lazy(() => import("@/pages/settings/NotificationPreferences"));
const NotificationsPage = lazy(() => import("@/pages/notifications/NotificationsPage"));
const MessagesPage = lazy(() => import("@/pages/messages/MessagesPage"));
const SuperAdminDashboard = lazy(() => import("@/pages/super-admin/SuperAdminDashboard"));
const AdminDangerZone = lazy(() => import("@/pages/admin/AdminDangerZone"));
const AdminAuditLog = lazy(() => import("@/pages/admin/AdminAuditLog"));
const AdminStudentTranscript = lazy(() => import("@/pages/admin/AdminStudentTranscript"));
const AcceptInvitePage = lazy(() => import("@/pages/auth/AcceptInvitePage"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));
const AtRiskStudents = lazy(() => import("@/pages/reports/AtRiskStudents"));
const StudentProgressReport = lazy(() => import("@/pages/reports/StudentProgressReport"));
const AdminCertificates = lazy(() => import("@/pages/admin/AdminCertificates"));
const AdminBulkImport = lazy(() => import("@/pages/admin/AdminBulkImport"));
const QuestionBanksPage = lazy(() => import("@/pages/question-banks/QuestionBanksPage"));
const StudentCertificates = lazy(() => import("@/pages/student/StudentCertificates"));
const CertificatePage = lazy(() => import("@/pages/certificates/CertificatePage"));
const VerifyCertificatePage = lazy(() => import("@/pages/certificates/VerifyCertificatePage"));


function StudentVideoSession() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  // Join the room of the course's *active* session (POST /video/sessions
  // names it "solomonquest-<id>-<timestamp>"). This page used to embed a
  // made-up "solomonquest-course-<id>" room, so a student opening it sat in
  // an empty room while the class ran elsewhere.
  const [room, setRoom] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/video/sessions?course_id=${encodeURIComponent(courseId ?? "")}`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setRoom(data?.is_active && data?.room_name ? data.room_name : null);
      } catch {
        if (!cancelled) setRoom(null);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
      <h1 className="text-2xl font-bold mb-4">Live Video Session</h1>
      {room === undefined ? (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      ) : room === null ? (
        <p className="text-muted-foreground">There is no live class running for this course right now.</p>
      ) : (
        <div className="w-full max-w-4xl aspect-video bg-muted rounded-xl flex items-center justify-center border">
          <iframe
            src={`https://meet.jit.si/${room}`}
            allow="camera; microphone; fullscreen; display-capture"
            className="w-full h-full rounded-xl"
            title="Video Session"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Top-level path segments that belong to the app itself (or are obvious
 * app-ish words), never to a school. The root /:slug routes below are a
 * catch-all placed after every specific route, so they can't shadow a real
 * route that is registered above them — this list additionally makes paths
 * like /login, /dashboard or /transcripts (which aren't routes here) render
 * a real 404 instead of a "school not found" page, and keeps any future
 * school slug from masquerading as an app page.
 */
const RESERVED_ROOT_SEGMENTS = new Set([
  "api", "auth", "login", "logout", "register", "signup", "onboarding",
  "schools", "dashboard", "admin", "super_admin", "teacher", "student", "parent",
  "chat", "forum", "invite", "messages", "calendar", "settings", "notifications",
  "profile", "transcript", "transcripts", "help", "assets", "static", "reports",
  "verify", "certificates",
]);

function RootSchoolRoute({ apply = false }: { apply?: boolean }) {
  const params = useParams<{ slug: string }>();
  const slug = (params.slug ?? "").toLowerCase();
  if (!slug || RESERVED_ROOT_SEGMENTS.has(slug)) return <NotFound />;
  return apply ? <SchoolApply /> : <SchoolPublicPage />;
}

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

export function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth/login" component={Login} />
        <Route path="/auth/register" component={Register} />
        <Route path="/auth/reset-password"><ResetPassword /></Route>

        <Route path="/onboarding/setup">
          <ProtectedRoute><OnboardingSetup /></ProtectedRoute>
        </Route>
        <Route path="/onboarding/join" component={OnboardingJoin} />

        <Route path="/schools/:slug" component={SchoolPublicPage} />
        <Route path="/schools/:slug/apply" component={SchoolApply} />

        {/* Admin Routes */}
        <Route path="/dashboard/admin">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminOverview /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/users">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminUsers /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/courses/:id/modules">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminCourseModules /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/courses">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminCourses /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/programs">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminPrograms /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/tuition">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminTuition /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/accounting">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminAccounting /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/terms">
          <ProtectedRoute allowedRoles={["admin", "super_admin", "staff"]}><AdminTerms /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/admissions">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminAdmissions /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/resources">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminResources /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/analytics">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminAnalytics /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/reminders">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminReminders /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/settings">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminSettings /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/branding">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminSchoolBranding /></ProtectedRoute>
        </Route>

        {/* Teacher Routes */}
        <Route path="/dashboard/teacher">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherOverview /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/courses/:id">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherCourseDetail /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/courses/:id/assignments">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/gradebook">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherGradebook /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/assignments">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/quiz-builder">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherQuizBuilder /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/analytics">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAnalytics /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/attendance">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAttendance /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/reminders">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherReminders /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/resources">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherResources /></ProtectedRoute>
        </Route>

        {/* Student Routes */}
        <Route path="/dashboard/student">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentOverview /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/courses/:id">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentCourseDetail /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/assignments">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/quiz/:id">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentQuizTake /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/quizzes">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentQuizzes /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/tuition">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentTuition /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/quizzes/:id">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentQuizTake /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/transcript">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentTranscript /></ProtectedRoute>
        </Route>

        {/* Teacher Quiz Route */}
        <Route path="/dashboard/teacher/quizzes">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherQuizBuilder /></ProtectedRoute>
        </Route>

        {/* Parent/Guardian Routes */}
        <Route path="/dashboard/parent">
          <ProtectedRoute allowedRoles={["parent"]}><ParentOverview /></ProtectedRoute>
        </Route>

        {/* Chat & Forum Routes */}
        <Route path="/chat">
          <ProtectedRoute><ChatPage /></ProtectedRoute>
        </Route>
        <Route path="/forum">
          <ProtectedRoute><ForumPage /></ProtectedRoute>
        </Route>
        <Route path="/forum/topics/:id">
          <ProtectedRoute><ForumTopicPage /></ProtectedRoute>
        </Route>

        {/* Invite Accept Route */}
        <Route path="/invite/:token" component={AcceptInvitePage} />

        {/* Student Video Route */}
        <Route path="/dashboard/student/courses/:id/video">
          <ProtectedRoute allowedRoles={["student", "staff", "teacher", "admin", "super_admin"]}>
            <StudentVideoSession />
          </ProtectedRoute>
        </Route>

        {/* Messages Route */}
        <Route path="/messages">
          <ProtectedRoute><MessagesPage /></ProtectedRoute>
        </Route>

        {/* Calendar Route — assignment due dates, live sessions, reminders in one feed */}
        <Route path="/calendar">
          <ProtectedRoute><CalendarPage /></ProtectedRoute>
        </Route>

        {/* Super Admin Routes */}
        <Route path="/super_admin">
          <ProtectedRoute allowedRoles={["super_admin"]}><SuperAdminDashboard /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/danger-zone">
          <ProtectedRoute allowedRoles={["admin","super_admin"]}><AdminDangerZone /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/audit-log">
          <ProtectedRoute allowedRoles={["admin","super_admin"]}><AdminAuditLog /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/students/:id/transcript">
          <ProtectedRoute allowedRoles={["admin","super_admin"]}><AdminStudentTranscript /></ProtectedRoute>
        </Route>

        {/* Settings Routes */}
        <Route path="/settings/notifications">
          <ProtectedRoute><NotificationPreferences /></ProtectedRoute>
        </Route>
        <Route path="/notifications">
          <ProtectedRoute><NotificationsPage /></ProtectedRoute>
        </Route>

        {/* Student Profile Route */}
        <Route path="/dashboard/student/profile">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentProfilePage /></ProtectedRoute>
        </Route>

        {/* My Profile — shared editable profile page for every role */}
        <Route path="/profile">
          <ProtectedRoute><MyProfilePage /></ProtectedRoute>
        </Route>

        {/* Public Transcript Verification Route */}
        <Route path="/transcript" component={TranscriptVerifyPage} />

        {/* At-risk students + per-student progress reports (server enforces who may see which student) */}
        <Route path="/dashboard/admin/at-risk">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AtRiskStudents /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/at-risk">
          <ProtectedRoute allowedRoles={["teacher"]}><AtRiskStudents /></ProtectedRoute>
        </Route>
        <Route path="/reports/students/:id">
          <ProtectedRoute><StudentProgressReport /></ProtectedRoute>
        </Route>
        {/* Certificates, question banks, bulk import */}
        <Route path="/dashboard/admin/certificates">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminCertificates /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/bulk-import">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminBulkImport /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/question-banks">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><QuestionBanksPage /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/question-banks">
          <ProtectedRoute allowedRoles={["teacher"]}><QuestionBanksPage /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/certificates">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentCertificates /></ProtectedRoute>
        </Route>
        <Route path="/certificates/:id">
          <ProtectedRoute><CertificatePage /></ProtectedRoute>
        </Route>
        {/* Public certificate verification (no login) */}
        <Route path="/verify/:code" component={VerifyCertificatePage} />
        <Route path="/verify" component={VerifyCertificatePage} />

        {/* Help Center — public, so signed-out visitors get getting-started guides;
            HelpPage picks guides (and the layout) from the viewer's role. */}
        <Route path="/help" component={HelpPage} />
        <Route path="/help/:slug" component={HelpPage} />

        {/* School public homepage at the platform root, e.g. solomonquest.com/lincoln-academy.
            Placed last (before the 404 fallback) so it only matches when no more specific
            route above claimed the path — /schools/:slug above still works too. */}
        <Route path="/:slug/apply"><RootSchoolRoute apply /></Route>
        <Route path="/:slug"><RootSchoolRoute /></Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
