import { Switch, Route } from "wouter";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import OnboardingSetup from "@/pages/onboarding/OnboardingSetup";
import OnboardingJoin from "@/pages/onboarding/OnboardingJoin";
import SchoolPublicPage from "@/pages/school/SchoolPublicPage";
import SchoolApply from "@/pages/school/SchoolApply";

import AdminOverview from "@/pages/admin/AdminOverview";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminCourses from "@/pages/admin/AdminCourses";
import AdminAdmissions from "@/pages/admin/AdminAdmissions";
import AdminSettings from "@/pages/admin/AdminSettings";

import TeacherOverview from "@/pages/teacher/TeacherOverview";
import TeacherCourseDetail from "@/pages/teacher/TeacherCourseDetail";
import TeacherAssignments from "@/pages/teacher/TeacherAssignments";
import TeacherGradebook from "@/pages/teacher/TeacherGradebook";

import StudentOverview from "@/pages/student/StudentOverview";
import StudentCourseDetail from "@/pages/student/StudentCourseDetail";
import StudentAssignments from "@/pages/student/StudentAssignments";

export function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/register" component={Register} />
      
      <Route path="/onboarding/setup">
        <ProtectedRoute><OnboardingSetup /></ProtectedRoute>
      </Route>
      <Route path="/onboarding/join">
        <ProtectedRoute><OnboardingJoin /></ProtectedRoute>
      </Route>

      <Route path="/schools/:slug" component={SchoolPublicPage} />
      <Route path="/schools/:slug/apply" component={SchoolApply} />

      {/* Admin Routes */}
      <Route path="/dashboard/admin">
        <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminOverview /></ProtectedRoute>
      </Route>
      <Route path="/dashboard/admin/users">
        <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/dashboard/admin/courses">
        <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminCourses /></ProtectedRoute>
      </Route>
      <Route path="/dashboard/admin/admissions">
        <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminAdmissions /></ProtectedRoute>
      </Route>
      <Route path="/dashboard/admin/settings">
        <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminSettings /></ProtectedRoute>
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

      <Route component={NotFound} />
    </Switch>
  );
}
