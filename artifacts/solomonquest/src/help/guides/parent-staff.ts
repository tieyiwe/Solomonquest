import type { Guide } from "../types";
import { badge, card, list, menu, row, screen, small, stats, text, toggle } from "../mock";

export const parentGuides: Guide[] = [
  {
    slug: "parent-getting-linked",
    title: "Get linked to your child",
    summary: "Your school links your account to your child. Here's how it works.",
    roles: ["parent"],
    category: "start",
    format: "steps",
    path: "/dashboard/parent",
    where: "My Children",
    keywords: ["link", "child", "son", "daughter", "no linked students", "connect"],
    steps: [
      { title: "Ask your school", text: "Parents are linked by the school office. Ask them to send you a parent invitation for your child." },
      { title: "Accept the email invite", text: "Open the invitation email, tap Accept Invitation and create your password." },
      { title: "See your child", text: "Your child now appears under My Children on your dashboard.", tip: "If you see \"No linked students yet\", the school hasn't linked you. Contact their admin office." },
      { title: "More than one child?", text: "The school sends one invitation per child. Accept each one with the same email." },
    ],
    related: ["accept-an-invite", "parent-dashboard"],
  },
  {
    slug: "parent-dashboard",
    title: "Follow your child's progress",
    summary: "Grades, attendance and tuition at a glance, plus a full progress report.",
    roles: ["parent"],
    category: "grades",
    format: "animated",
    path: "/dashboard/parent",
    where: "My Children",
    keywords: ["grades", "attendance", "tuition", "progress report", "child", "report card"],
    screens: {
      p: screen("parent", undefined, "My Children", [
        text("Grades, attendance, and tuition at a glance."),
        card("child", "Amara Okafor", [
          row([badge("id", "WB-STU1", "muted"), small("report", "Progress report", "outline", "file")], "between"),
          stats([{ label: "Attendance (30d)", value: "91%", tone: "success" }, { label: "Tuition", value: "Partial", tone: "warning" }], "stats"),
          card("grades", "Recent Grades", [list("g", [{ title: "Essay", meta: "World History", badge: "88 / 100", tone: "success" }])]),
        ]),
        card("ann", "School & class announcements", [list("a", [{ title: "Winter break dates", meta: "School office" }])]),
      ]),
      r: screen("parent", undefined, "Progress report · Amara Okafor", [
        stats([{ label: "Average grade", value: "86%" }, { label: "Attendance", value: "91%" }, { label: "Late submissions", value: "1", tone: "warning" }], "sum"),
        card("miss", "Missing work", [list("m", [{ title: "Problem set 3", meta: "Algebra II · due Nov 18", badge: "Missing", tone: "danger" }])]),
        row([small("print", "Print", "outline", "print"), small("csv", "CSV", "outline", "download")], "end"),
      ]),
    },
    steps: [
      { title: "Your child's card", text: "Each linked child has a card on My Children.", target: "child" },
      { title: "Grades", text: "Recent Grades shows their latest marked work.", target: "grades" },
      { title: "Attendance and tuition", text: "See the last 30 days of attendance and their tuition status.", target: "stats" },
      { title: "Open the progress report", text: "Tap Progress report for the full picture.", target: "report" },
      { title: "What needs attention", text: "Missing and late work are listed, so you know what to ask about.", screen: "r", target: "miss" },
      { title: "Keep a copy", text: "Print it for a meeting with the teacher.", target: "print" },
    ],
    related: ["parent-notifications"],
  },
  {
    slug: "parent-notifications",
    title: "Stay informed with notifications",
    summary: "Choose email or in-app alerts for grades and announcements.",
    roles: ["parent"],
    category: "account",
    format: "animated",
    path: "/settings/notifications",
    where: "Account menu → Notification Settings",
    keywords: ["notifications", "email", "alerts", "announcements", "grades"],
    screens: {
      n: screen("parent", undefined, "Notification Preferences", [
        card("d", "Delivery", [toggle("inapp", "In-App Notifications", true), toggle("email", "Email Notifications", false, "Receive notifications via email.")]),
        card("t", "Notify Me About", [toggle("ann", "Announcements", true, "School-wide and course announcements."), toggle("gr", "Grades", true)]),
      ], { actions: [menu("acct", [{ id: "m-profile", label: "My Profile", icon: "user" }, { id: "m-notif", label: "Notification Settings", icon: "bell" }])] }),
    },
    steps: [
      { title: "Open your account menu", text: "Tap your avatar at the top right.", target: "avatar" },
      { title: "Notification Settings", text: "Choose Notification Settings.", target: "m-notif", set: { acct: { open: true } } },
      { title: "Get emails", text: "Turn on Email Notifications if you'd like updates by email.", target: "email", set: { acct: { open: false }, email: { on: true } } },
      { title: "Pick topics", text: "Keep Announcements and Grades on to hear about what matters most.", target: "gr" },
    ],
  },
  {
    slug: "parent-progress-digest",
    title: "Your progress digest",
    summary: "Your school's regular update on how your children are doing, by email and in the app.",
    roles: ["parent"],
    category: "grades",
    format: "steps",
    path: "/notifications",
    where: "Notifications (the bell) and your email",
    keywords: ["digest", "weekly update", "summary", "progress email", "report", "unsubscribe", "turn off"],
    steps: [
      { title: "What it is", text: "Your school can send a short update every week, every two weeks or every month. It tells you how your child is doing: grades, attendance, missing work and what's due next." },
      { title: "One digest for the family", text: "If you have more than one child at the school, you get one digest with a section for each child." },
      { title: "Reading the status", text: "Each child is marked On track, Worth a look or Needs attention, with a short reason, so you know what to ask about." },
      { title: "See everything", text: "Tap View full progress report in the email, or open the notification, to see your child's full report." },
      { title: "Where to find it", text: "It arrives in your notifications (the bell) and, if you get emails, in your inbox." },
      { title: "Turn it off", text: "Open your account menu, choose Notification Settings and switch off Progress digest. You can switch it back on any time.", tip: "Turning off Email Notifications stops the email but keeps the digest in the app." },
    ],
    related: ["parent-dashboard", "parent-notifications"],
  },
];

export const staffGuides: Guide[] = [
  {
    slug: "staff-getting-started",
    title: "Getting started as staff",
    summary: "What staff members can do in SolomonQuest.",
    roles: ["staff"],
    category: "start",
    format: "steps",
    path: "/dashboard/student",
    where: "Your dashboard",
    keywords: ["staff", "role", "what can i do", "dashboard"],
    steps: [
      { title: "Your dashboard", text: "You land on Overview. It shows the courses you've been added to, announcements and what's coming up." },
      { title: "Your sidebar", text: "Overview, Calendar, Assignments, Quizzes, Forum, Transcript, Chat, Tuition, Certificates and Help Center, plus Terms & Scheduling for staff. Your courses are listed under My Courses." },
      { title: "Terms & Scheduling", text: "Open Terms & Scheduling at the bottom of the sidebar to add or edit terms and see which classes run in each." },
      { title: "Community", text: "Use the Forum, Chat and Messages to support students and teachers. The gold Notes button and the navy assistant button sit at the bottom right.", tip: "What you can see (e.g. student contact info) is set by your school admin under Role Permissions." },
    ],
    related: ["admin-terms", "forum", "chat", "notes"],
  },
];
