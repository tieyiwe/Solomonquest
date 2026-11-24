import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlarmClock,
  AlertTriangle,
  BarChart2,
  Bell,
  BookOpen,
  CalendarCheck,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Phone,
  PhoneOff,
  Scroll,
  Settings,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { dashboardPathForRole } from "@/lib/roleHome";
import type { ActiveCall, IncomingCall } from "./types";

// ---------------------------------------------------------------------------
// Role-aware icon rail (desktop only — phones get a dashboard link in the
// conversation list header instead, so the list keeps the full width).
// ---------------------------------------------------------------------------

const ADMIN_LINKS = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/admin/danger-zone", label: "Danger Zone", icon: AlertTriangle },
];
const TEACHER_LINKS = [
  { href: "/dashboard/teacher", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: FileText },
  { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: ClipboardList },
  { href: "/dashboard/teacher/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/dashboard/teacher/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/teacher/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/teacher/reminders", label: "Reminders", icon: AlarmClock },
];
// Parents can't open any /dashboard/student/* page (ProtectedRoute bounces
// them), so they get their own short rail instead of the student one.
const PARENT_LINKS = [
  { href: "/dashboard/parent", label: "Overview", icon: LayoutDashboard },
  { href: "/messages", label: "Messages", icon: FileText },
  { href: "/forum", label: "Forum", icon: MessageSquare },
];
const STUDENT_LINKS = [
  { href: "/dashboard/student", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/student/assignments", label: "Assignments", icon: FileText },
  { href: "/dashboard/student/quizzes", label: "Quizzes", icon: ClipboardList },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/dashboard/student/transcript", label: "Transcript", icon: Scroll },
];

export function DashboardRail({ role }: { role?: string | null }) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const links =
    role === "admin" || role === "super_admin"
      ? ADMIN_LINKS
      : role === "teacher"
      ? TEACHER_LINKS
      : role === "parent"
      ? PARENT_LINKS
      : STUDENT_LINKS;
  const dashboardHref = dashboardPathForRole(role);

  return (
    <nav
      aria-label="Dashboard"
      className="hidden md:flex flex-shrink-0 flex-col h-full overflow-hidden transition-[width] duration-200 motion-reduce:transition-none bg-sidebar border-r border-sidebar-border"
      style={{ width: expanded ? 200 : 56 }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setExpanded(true)}
      onPointerLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setExpanded(false)}
    >
      <div className="flex items-center px-2.5 h-16 border-b border-sidebar-border flex-shrink-0 gap-2">
        <Link
          href={dashboardHref}
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-sidebar-primary text-sidebar-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Go to dashboard"
          title="Go to dashboard"
        >
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
        </Link>
        {expanded && <span className="text-sidebar-foreground/70 text-xs font-medium truncate">Dashboard</span>}
      </div>
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = link.href === dashboardHref ? location === link.href : location.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              title={!expanded ? link.label : undefined}
              aria-label={link.label}
              className={`flex items-center gap-2.5 px-2.5 h-10 rounded-lg transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {expanded && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </div>
      <div className="px-2 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 h-10 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-sm" aria-current="page">
          <MessageSquare className="h-4 w-4 shrink-0 text-sidebar-primary" aria-hidden="true" />
          {expanded && <span className="truncate">Chat</span>}
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Incoming call — rings until accepted, declined, or the caller hangs up
// ---------------------------------------------------------------------------

export function IncomingCallBanner({ call, onAccept, onDecline }: { call: IncomingCall; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[max(5rem,env(safe-area-inset-top))] bg-foreground/20 px-4" role="alertdialog" aria-label={`Incoming video call from ${call.channelName}`}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl bg-card border overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 motion-reduce:animate-none">
        <div className="p-5 flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary animate-pulse motion-reduce:animate-none" />
            </div>
            <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping motion-reduce:animate-none" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">Incoming video call</p>
            <p className="text-sm text-muted-foreground truncate">{call.channelName}</p>
          </div>
        </div>
        <div className="flex border-t">
          <button onClick={onDecline} className="flex-1 flex items-center justify-center gap-2 h-12 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
            <X className="h-4 w-4" />
            Decline
          </button>
          <button onClick={onAccept} autoFocus className="flex-1 flex items-center justify-center gap-2 h-12 text-sm font-medium text-success-foreground bg-success hover:bg-success/90 transition-colors">
            <Phone className="h-4 w-4" />
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active call — embedded Jitsi, in-app instead of a separate tab
// ---------------------------------------------------------------------------

export function ActiveCallOverlay({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  const jitsiUrl = `https://meet.jit.si/${call.jitsiRoom}#config.prejoinPageEnabled=false`;
  return (
    <div className="fixed inset-0 z-[90] bg-sidebar flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-sidebar text-sidebar-accent-foreground flex-shrink-0 border-b border-sidebar-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse motion-reduce:animate-none shrink-0" />
          <span className="text-sm font-medium truncate">{call.channelName}</span>
        </div>
        <Button size="sm" variant="destructive" onClick={onEnd} className="h-10">
          <PhoneOff className="h-4 w-4 mr-1.5" />
          Leave
        </Button>
      </div>
      <iframe src={jitsiUrl} className="flex-1 w-full border-0" allow="camera; microphone; display-capture; fullscreen; autoplay" title="Video call" />
    </div>
  );
}
