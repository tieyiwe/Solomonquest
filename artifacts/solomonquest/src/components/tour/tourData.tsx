import React from "react";
import {
  LayoutDashboard, Users, BookOpen, CheckSquare, Settings,
  GraduationCap, ClipboardList, FileText, FolderOpen, BarChart2,
  MessageSquare, Bell, Star, Sparkles, School,
} from "lucide-react";

export interface TourStep {
  title: string;
  description: string;
  tip?: string;
  illustration: React.ReactNode;
}

// ─── Shared mini-UI building blocks ──────────────────────────────────────────

function MiniSidebar({ links, active }: { links: { icon: React.ElementType; label: string }[]; active: number }) {
  return (
    <div className="w-36 bg-slate-900 rounded-l-lg h-full flex flex-col py-3 px-2 gap-1 shrink-0">
      {links.map((l, i) => {
        const Icon = l.icon;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              i === active ? "bg-primary text-white" : "text-slate-400"
            }`}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span>{l.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm">
      <p className="text-[10px] text-gray-500 mb-0.5">{title}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniTable({ rows }: { rows: string[][] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
      {rows.map((row, i) => (
        <div key={i} className={`flex items-center gap-3 px-3 py-2 text-[10px] ${i === 0 ? "bg-gray-50 font-semibold text-gray-500" : "text-gray-700 border-t border-gray-50"}`}>
          {row.map((cell, j) => (
            <span key={j} className={j === 0 ? "flex-1" : "w-16 text-right"}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function MiniUser({ name, role, avatar }: { name: string; role: string; avatar: string }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg p-2 shadow-sm">
      <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
        {avatar}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-800">{name}</p>
        <p className="text-[9px] text-gray-400 capitalize">{role}</p>
      </div>
      <div className={`ml-auto h-1.5 w-1.5 rounded-full ${role === "student" ? "bg-green-400" : role === "teacher" ? "bg-blue-400" : "bg-orange-400"}`} />
    </div>
  );
}

// ─── ADMIN TOUR ───────────────────────────────────────────────────────────────

const adminLinks = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: Users, label: "Users" },
  { icon: BookOpen, label: "Courses" },
  { icon: CheckSquare, label: "Admissions" },
  { icon: FolderOpen, label: "Resources" },
  { icon: Settings, label: "Settings" },
];

export const adminTourSteps: TourStep[] = [
  {
    title: "Welcome, Administrator! 🎉",
    description: "You're in control. This quick tour will show you the key areas of your admin dashboard so you can manage your school with confidence.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <School className="h-10 w-10 text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 bg-yellow-400 rounded-full flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Your Dashboard Overview",
    description: "The Overview is your command center. See enrollment stats, active courses, pending admissions, and recent activity at a glance.",
    tip: "Check this page daily to stay on top of your school's activity.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={adminLinks} active={0} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Overview</p>
          <div className="grid grid-cols-2 gap-1.5">
            <MiniCard title="Students" value="128" color="text-primary" />
            <MiniCard title="Courses" value="12" color="text-blue-600" />
            <MiniCard title="Pending" value="5" color="text-orange-500" />
            <MiniCard title="Teachers" value="8" color="text-green-600" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Manage Your Users",
    description: "In the Users section you can view all students, teachers, and staff. Invite new teachers, review student profiles, and manage roles.",
    tip: "Use the invite button to send email invitations to teachers and staff.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={adminLinks} active={1} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Users</p>
          <div className="flex flex-col gap-1.5">
            <MiniUser name="Alice Johnson" role="student" avatar="AJ" />
            <MiniUser name="Mr. Roberts" role="teacher" avatar="MR" />
            <MiniUser name="Sam Okafor" role="staff" avatar="SO" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Create & Manage Courses",
    description: "The Courses section lets you create new courses, assign teachers, set schedules, and enroll students.",
    tip: "Assign a teacher to a course before publishing it to students.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={adminLinks} active={2} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Courses</p>
          <MiniTable rows={[
            ["Course Name", "Students", "Status"],
            ["Mathematics 101", "32", "Active"],
            ["English Lit", "28", "Active"],
            ["Physics A", "19", "Draft"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "Review Admissions",
    description: "Applications from prospective students land here. Review, approve, or reject them and convert accepted applicants into enrolled students.",
    tip: "Approve applications in bulk by selecting multiple rows.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={adminLinks} active={3} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Admissions</p>
          <MiniTable rows={[
            ["Applicant", "Status"],
            ["Jane Doe", "Pending"],
            ["Tom Brown", "Approved"],
            ["Kim Lee", "Rejected"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "School Branding & Settings",
    description: "Customize your school's name, logo, banner image, and primary colour. Your banner appears on the homepage Explore Schools section.",
    tip: "Upload a banner image — it shows on the public school card that students see.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={adminLinks} active={5} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Settings → Branding</p>
          <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
            <div className="h-10 bg-gradient-to-r from-primary to-blue-500" />
            <div className="p-2 flex items-center gap-2">
              <div className="h-7 w-7 rounded-full border-2 border-white bg-primary flex items-center justify-center text-white font-bold text-[9px] -mt-4 shadow-sm">S</div>
              <div>
                <p className="text-[9px] font-semibold">My School</p>
                <p className="text-[8px] text-gray-400">Set your branding</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Analytics & Reports",
    description: "Track attendance rates, grade distributions, and student progress in the Analytics section. Export reports for stakeholders.",
    tip: "Navigate to Dashboard → Analytics from the sidebar to view detailed charts.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={adminLinks} active={0} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Analytics</p>
          <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
            <div className="flex items-end gap-1 h-12 mt-1">
              {[40, 65, 50, 80, 70, 90, 75].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm bg-primary/20 relative" style={{ height: `${h}%` }}>
                  <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-sm" style={{ height: `${h * 0.6}%` }} />
                </div>
              ))}
            </div>
            <p className="text-[8px] text-gray-400 text-center mt-1">Weekly engagement</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "You're all set! 🚀",
    description: "You now know your way around the admin panel. Remember, the Help Center (? button) is always available if you need guidance on any specific task.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <Star className="h-8 w-8 text-green-500 fill-green-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Ready to manage your school!</p>
          <p className="text-[10px] text-gray-400 mt-1">Click the <strong>?</strong> button anytime for help</p>
        </div>
      </div>
    ),
  },
];

// ─── TEACHER TOUR ─────────────────────────────────────────────────────────────

const teacherLinks = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: BookOpen, label: "My Courses" },
  { icon: FileText, label: "Assignments" },
  { icon: ClipboardList, label: "Gradebook" },
  { icon: FolderOpen, label: "Resources" },
];

export const teacherTourSteps: TourStep[] = [
  {
    title: "Welcome, Teacher! 📚",
    description: "This quick tour walks you through the tools you'll use every day to teach, grade, and communicate with your students.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-blue-50 flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-blue-500" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 bg-blue-400 rounded-full flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Your Teaching Overview",
    description: "The Overview shows your assigned courses, upcoming deadlines, ungraded submissions, and student activity across all your classes.",
    tip: "The notification bell alerts you when students submit work or ask questions.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={teacherLinks} active={0} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Overview</p>
          <div className="grid grid-cols-2 gap-1.5">
            <MiniCard title="My Courses" value="4" color="text-blue-600" />
            <MiniCard title="Ungraded" value="7" color="text-orange-500" />
            <MiniCard title="Students" value="94" color="text-primary" />
            <MiniCard title="This Week" value="3 ✓" color="text-green-600" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Your Courses",
    description: "The My Courses section expands in the sidebar to list each course you teach. Click a course to manage its lessons, materials, and enrolled students.",
    tip: "Add lesson materials in the course detail page under the Materials tab.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={teacherLinks} active={1} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">My Courses</p>
          <MiniTable rows={[
            ["Course", "Students"],
            ["Maths 101", "32 enrolled"],
            ["English Lit", "28 enrolled"],
            ["Physics A", "19 enrolled"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "Create & Grade Assignments",
    description: "In Assignments you can create tasks, set due dates, and grade submissions. Students are notified automatically when you post new work.",
    tip: "Use the rubric feature to give consistent, fair feedback.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={teacherLinks} active={2} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Assignments</p>
          <MiniTable rows={[
            ["Assignment", "Due", "Grade"],
            ["Essay #1", "Jan 20", "✓"],
            ["Quiz 3", "Jan 22", "—"],
            ["Project", "Jan 30", "—"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "The Gradebook",
    description: "The Gradebook gives you a full matrix view of every student's scores across all assignments. Edit grades directly in the cells.",
    tip: "Click a cell to enter or update a grade. Changes save automatically.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={teacherLinks} active={3} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Gradebook</p>
          <MiniTable rows={[
            ["Student", "Essay", "Quiz", "Avg"],
            ["A. Brown", "88", "92", "90"],
            ["B. Kim", "74", "80", "77"],
            ["C. Cruz", "95", "91", "93"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "Resources & Materials",
    description: "Upload PDFs, slides, videos, and links to the Resources section. Students in your courses can download them anytime.",
    tip: "Organise resources by course using the filter at the top of the page.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={teacherLinks} active={4} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Resources</p>
          <div className="flex flex-col gap-1.5">
            {["Lecture Slides.pdf", "Reading List.docx", "Lab Guide.pdf"].map((name, i) => (
              <div key={i} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg p-2 shadow-sm">
                <FolderOpen className="h-3 w-3 text-primary shrink-0" />
                <span className="text-[10px] text-gray-700 truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "You're ready to teach! 🌟",
    description: "Your classroom is set up and ready. Need help with anything specific? Click the ? button at any time to open the Help Center.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
            <Star className="h-8 w-8 text-blue-500 fill-blue-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Happy teaching!</p>
          <p className="text-[10px] text-gray-400 mt-1">Click the <strong>?</strong> button anytime for help</p>
        </div>
      </div>
    ),
  },
];

// ─── STUDENT TOUR ─────────────────────────────────────────────────────────────

const studentLinks = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: BookOpen, label: "My Courses" },
  { icon: CheckSquare, label: "Assignments" },
  { icon: ClipboardList, label: "Transcript" },
  { icon: MessageSquare, label: "Forum" },
];

export const studentTourSteps: TourStep[] = [
  {
    title: "Welcome to SolomonQuest! 🎓",
    description: "You're now enrolled. This tour will help you find your courses, submit assignments, check your grades, and connect with your classmates.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-green-50 flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-green-500" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 bg-green-400 rounded-full flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Your Student Overview",
    description: "Your Overview shows upcoming due dates, your enrolled courses, recent announcements, and your current grade average — all in one place.",
    tip: "Check this page every morning to see what's due today.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={0} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Overview</p>
          <div className="grid grid-cols-2 gap-1.5">
            <MiniCard title="Courses" value="4" color="text-primary" />
            <MiniCard title="Due Soon" value="2" color="text-orange-500" />
            <MiniCard title="Avg Grade" value="84%" color="text-green-600" />
            <MiniCard title="Messages" value="3" color="text-blue-600" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Access Your Courses",
    description: "Click any enrolled course to open its content: video lessons, lecture notes, reading materials, and live session links are all inside.",
    tip: "Your teacher may post new materials throughout the term — check regularly.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={1} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">My Courses</p>
          <MiniTable rows={[
            ["Course", "Progress"],
            ["Mathematics 101", "68%"],
            ["English Lit", "82%"],
            ["Physics A", "45%"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "Submit Assignments",
    description: "Assignments shows everything your teachers have set. Click an assignment to read the instructions and submit your work before the deadline.",
    tip: "You'll get a notification when your teacher grades your submission.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={2} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Assignments</p>
          <MiniTable rows={[
            ["Task", "Due", "Status"],
            ["Essay #1", "Jan 20", "Submitted"],
            ["Quiz 3", "Jan 22", "Pending"],
            ["Project", "Jan 30", "—"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "View Your Transcript",
    description: "Your Transcript shows your official grades for every course. Download it as a PDF to share with employers or other institutions.",
    tip: "Administrators can verify your transcript using the public verification link.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={3} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Transcript</p>
          <MiniTable rows={[
            ["Course", "Grade"],
            ["Mathematics 101", "A (92)"],
            ["English Lit", "B+ (87)"],
            ["Physics A", "A- (90)"],
          ]} />
        </div>
      </div>
    ),
  },
  {
    title: "Connect on the Forum",
    description: "The Forum is where teachers post announcements and discussions. Ask questions, share insights, and react to posts — your classmates and teachers can reply.",
    tip: "You'll be notified when someone replies to a thread you participated in.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={4} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Forum</p>
          <div className="flex flex-col gap-1.5">
            {["📌 Welcome to the class!", "Week 3 reading guide", "Assignment #2 tips"].map((t, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-lg p-2 shadow-sm">
                <p className="text-[10px] font-medium text-gray-800">{t}</p>
                <p className="text-[8px] text-gray-400 mt-0.5">3 replies · 5 reactions</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "You're all set! 🌟",
    description: "Your learning journey starts now. If you ever need help navigating the platform, click the ? button to open the Help Center.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <Star className="h-8 w-8 text-green-500 fill-green-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Good luck with your studies!</p>
          <p className="text-[10px] text-gray-400 mt-1">Click the <strong>?</strong> button anytime for help</p>
        </div>
      </div>
    ),
  },
];

// ─── STAFF TOUR ───────────────────────────────────────────────────────────────

export const staffTourSteps: TourStep[] = [
  {
    title: "Welcome, Staff Member! 👋",
    description: "As a staff member you have access to courses, resources, forum discussions, and student communications. Let's walk through what you can do.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-orange-50 flex items-center justify-center">
            <Users className="h-10 w-10 text-orange-500" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 bg-orange-400 rounded-full flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Staff Overview",
    description: "Your Overview gives you a snapshot of your assigned courses, upcoming events, and any pending tasks assigned to you by administrators.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={0} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Staff Overview</p>
          <div className="grid grid-cols-2 gap-1.5">
            <MiniCard title="Courses" value="3" color="text-orange-500" />
            <MiniCard title="Students" value="62" color="text-primary" />
            <MiniCard title="Resources" value="14" color="text-green-600" />
            <MiniCard title="Messages" value="2" color="text-blue-600" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Participate in Forum Discussions",
    description: "Engage with students and teachers on the Forum. Post replies, share links, and react to discussions to support the learning community.",
    tip: "Pinned topics at the top of the forum are important announcements — read them first.",
    illustration: (
      <div className="flex h-full gap-2">
        <MiniSidebar links={studentLinks} active={4} />
        <div className="flex-1 bg-gray-50 rounded-r-lg p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-700">Forum</p>
          <div className="flex flex-col gap-1.5">
            {["📌 Staff announcements", "Q&A: Enrollment help", "Timetable update"].map((t, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-lg p-2 shadow-sm">
                <p className="text-[10px] font-medium text-gray-800">{t}</p>
                <p className="text-[8px] text-gray-400 mt-0.5">Click to read & reply</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "You're ready! 🎯",
    description: "Your staff dashboard is live. Use the ? button anytime to open the Help Center with step-by-step guides for every feature.",
    illustration: (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
            <Star className="h-8 w-8 text-orange-500 fill-orange-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Welcome to the team!</p>
          <p className="text-[10px] text-gray-400 mt-1">Click the <strong>?</strong> button anytime for help</p>
        </div>
      </div>
    ),
  },
];

export type UserRole = "admin" | "super_admin" | "teacher" | "student" | "staff";

export function getTourSteps(role?: UserRole | null): TourStep[] {
  if (role === "admin" || role === "super_admin") return adminTourSteps;
  if (role === "teacher") return teacherTourSteps;
  if (role === "staff") return staffTourSteps;
  return studentTourSteps;
}

export function getTourKey(role?: UserRole | null): string {
  if (role === "admin" || role === "super_admin") return "tour_done_admin";
  if (role === "teacher") return "tour_done_teacher";
  if (role === "staff") return "tour_done_staff";
  return "tour_done_student";
}
