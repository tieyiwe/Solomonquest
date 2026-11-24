import type { Audience, Guide, MockEl } from "../types";
import {
  area, badge, btn, card, dialog, list, progress, row, screen, small, stats, tabs, text, toast, upload, video,
} from "../mock";

// Staff use the student portal (StudentLayout) and can open courses,
// lessons, quizzes, transcript, tuition and certificates like a student.
const S: Audience[] = ["student", "staff"];
// The server only lets students hand in work, record video watch progress
// and open their own progress report, so these guides are students only.
const STUDENT_ONLY: Audience[] = ["student"];

const courseTabs = (active: number): MockEl => tabs("ctabs", ["Overview", "Modules", "Resources", "Assignments", "Quizzes", "Classmates", "Live"], active);

const dashboard = screen("student", "Overview", "Student Dashboard", [
  stats([{ label: "Enrolled Courses", value: "2" }, { label: "Pending Assignments", value: "1", tone: "warning" }, { label: "Average Grade", value: "88%", tone: "success" }]),
  card("mycourses", "My Courses", [list("cl", [
    { id: "course-alg", title: "Algebra II", meta: "Daniel Reyes · MATH-201", badge: "Live", tone: "danger" },
    { id: "course-his", title: "World History", meta: "Grace Lin · HIS-110", badge: "Open" },
  ])]),
]);

export const studentGuides: Guide[] = [
  {
    slug: "student-open-a-course",
    title: "Find and open your courses",
    summary: "Your courses are on your dashboard. Each one has tabs for everything inside it.",
    roles: S,
    category: "learning",
    format: "animated",
    path: "/dashboard/student",
    where: "Overview → My Courses",
    keywords: ["course", "class", "my courses", "enrolled", "where are my courses"],
    screens: {
      dash: dashboard,
      course: screen("student", "Overview", "Algebra II", [
        courseTabs(0),
        card("desc", "Course Description", [text("Quadratics, functions and polynomials. Bring a calculator!")]),
        card("ann", "Course announcements", [list("a", [{ title: "Bring a calculator", meta: "Daniel Reyes · today" }])]),
      ]),
    },
    steps: [
      { title: "Your dashboard", text: "After signing in you land on Overview. Your courses are listed under My Courses.", target: "mycourses" },
      { title: "Open a course", text: "Tap a course to open it. Courses with a live class running show a red Live badge.", target: "course-alg" },
      { title: "Use the tabs", text: "Overview, Modules, Resources, Assignments, Quizzes, Classmates and Live. Everything for this course is in one place.", screen: "course", target: "ctabs" },
      { title: "Read announcements", text: "Your teacher's announcements for this course appear on the Overview tab.", target: "ann" },
    ],
    troubleshoot: [{ problem: "A course is missing", fix: "Courses appear once you're enrolled and the course is published. Ask your school office if one is missing." }],
    related: ["student-modules-and-lessons", "student-submit-assignment"],
  },
  {
    slug: "student-modules-and-lessons",
    title: "Work through modules and lessons",
    summary: "Open a lesson, watch or read it, then mark it complete to unlock the next one.",
    roles: S,
    category: "learning",
    format: "animated",
    where: "Course → Modules",
    keywords: ["module", "lesson", "locked", "complete", "progress", "unit", "week"],
    screens: {
      modules: screen("student", "Overview", "Algebra II", [
        courseTabs(1),
        progress("prog", "Course progress", 40),
        card("m1", "Week 1: Foundations", [list("l1", [
          { id: "les1", title: "What is a function?", meta: "Lesson", badge: "Done", tone: "success" },
          { id: "les2", title: "Graphing basics", meta: "Lesson", badge: "Not started" },
        ])]),
        card("m2", "Week 2: Quadratics", [text("Complete the previous module first")], undefined, "muted"),
      ]),
      lesson: screen("student", "Overview", "Graphing basics", [
        small("back", "All modules", "ghost"),
        video("vid", "Lesson video", 0),
        text("Plot points, find intercepts, and sketch your first parabola."),
        row([btn("complete", "Mark complete", "gold", "check")], "end"),
        toast("done", "You've completed this lesson."),
      ]),
    },
    steps: [
      { title: "Open Modules", text: "Inside a course, tap the Modules tab.", target: "ctabs:1" },
      { title: "See your progress", text: "The bar shows how much of the course you've finished.", target: "prog" },
      { title: "Locked modules", text: "Some modules unlock only after you finish an earlier one. The message tells you what to do first.", target: "m2" },
      { title: "Open a lesson", text: "Tap a lesson to read it or watch its video.", target: "les2" },
      { title: "Learn", text: "Work through the lesson content and any attachments.", screen: "lesson", target: "vid", set: { vid: { progress: 100 } } },
      { title: "Mark it complete", text: "Tap Mark complete when you're done. Your progress updates and the next item opens.", target: "complete", set: { done: { open: true }, prog: { value: 60 }, les2: {} }, tip: "Changed your mind? Use Mark as not complete." },
    ],
    related: ["student-required-video", "student-submit-assignment"],
  },
  {
    slug: "student-submit-assignment",
    title: "Submit an assignment",
    summary: "Upload your file, add a note to your teacher and submit.",
    roles: STUDENT_ONLY,
    category: "learning",
    format: "animated",
    path: "/dashboard/student/assignments",
    where: "Sidebar → Assignments",
    keywords: ["assignment", "homework", "submit", "upload", "file", "turn in", "hand in"],
    screens: {
      list: screen("student", "Assignments", "My Assignments", [
        stats([{ label: "Overdue", value: "0" }, { label: "Due This Week", value: "1", tone: "warning" }, { label: "Total Pending", value: "1" }]),
        card("a1", "Quadratics problem set", [
          text("Algebra II · Due Fri 5:00 PM · 20 points"),
          row([btn("submit-work", "Submit Work", "primary", "upload")], "end"),
        ]),
        dialog("dlg", "Quadratics problem set", [
          text("Instructions: show your working for each problem."),
          upload("file", "Upload a file", "Optional, max 25 MB"),
          area("note", "Note to teacher", undefined, "Any notes or context for your teacher..."),
          row([btn("cancel", "Cancel", "outline"), btn("send", "Submit to Teacher", "primary", "send")], "end"),
        ]),
        toast("ok", "Submitted! 🎉"),
      ]),
    },
    steps: [
      { title: "Open Assignments", text: "Tap Assignments in the sidebar to see everything due, across all courses.", target: "nav:Assignments" },
      { title: "Choose the assignment", text: "Find it in the list and tap Submit Work.", target: "submit-work" },
      { title: "Upload your file", text: "Under Upload a file, choose your work from your device (up to 25 MB).", target: "file", set: { dlg: { open: true }, file: { file: "problem-set.pdf" } }, tip: "You can also use Or paste a link, e.g. for a Google Doc." },
      { title: "Add a note (optional)", text: "Tell your teacher anything they should know.", target: "note", set: { note: { value: "Q4 was tricky!" } } },
      { title: "Submit", text: "Tap Submit to Teacher. You'll see Submitted!, and your teacher is notified.", target: "send", set: { dlg: { open: false }, ok: { open: true } } },
    ],
    troubleshoot: [
      { problem: "The Submit to Teacher button is greyed out", fix: "If the assignment has a required video, watch it to the end first. If it's past a hard cutoff, the assignment will say it's closed." },
      { problem: "My upload failed", fix: "Check your connection and file size, then try again. Very large videos are better shared as a link." },
    ],
    related: ["student-late-work-and-extensions", "student-required-video"],
  },
  {
    slug: "student-late-work-and-extensions",
    title: "Late work and extensions",
    summary: "What happens if you submit after the due date, and how extensions work.",
    roles: STUDENT_ONLY,
    category: "learning",
    format: "steps",
    where: "Assignments → each assignment's late policy note",
    keywords: ["late", "penalty", "extension", "overdue", "deadline", "cutoff", "submit late"],
    steps: [
      { title: "Check the late policy", text: "Each assignment shows its rule, e.g. \"Late work loses 10% per day (max 50%).\" Some say \"Late work is not accepted.\"" },
      { title: "Submit late if allowed", text: "Overdue assignments show a Submit Late button. Your submission gets a Late badge with the penalty." },
      { title: "Hard cutoffs", text: "Some assignments close completely at a cutoff time. After that, you can't submit." },
      { title: "Extensions", text: "If your teacher gives you an extension, you'll see \"You have an extension\" and your own new due date. Your teacher may also waive the penalty.", tip: "Need more time? Message your teacher before the due date." },
    ],
    related: ["student-submit-assignment"],
  },
  {
    slug: "student-required-video",
    title: "Watch a required video",
    summary: "Some assignments need you to watch a video all the way through before you can submit.",
    roles: STUDENT_ONLY,
    category: "learning",
    format: "animated",
    where: "Assignments → Submit Work",
    keywords: ["video", "watch", "must watch", "required", "locked submit"],
    screens: {
      dlg: screen("student", "Assignments", "My Assignments", [
        card("a", "Intro to Parabolas", [
          row([text("Watch the video", false), badge("must", "Must watch in full to submit", "warning")], "between"),
          video("vid", "Intro to Parabolas", 10),
          text("Watch the entire video to unlock the submit button.", true, "hint"),
          row([btn("cancel", "Cancel", "outline"), btn("submit", "Submit to Teacher", "outline", "send")], "end"),
        ]),
      ]),
    },
    steps: [
      { title: "Look for the badge", text: "Tap Submit Work on the assignment. If it says Must watch in full to submit, the video comes first.", target: "must" },
      { title: "Play the video", text: "Tap play. You can't skip ahead, but you can pause and come back.", target: "vid", set: { vid: { progress: 65 } } },
      { title: "Watch to the end", text: "When the video finishes you'll see \"Video fully watched — you may now submit.\"", target: "hint", set: { vid: { progress: 100 }, hint: { text: "Video fully watched — you may now submit." } } },
      { title: "Submit", text: "The upload, link and note boxes appear and Submit to Teacher unlocks. Tap it to finish.", target: "submit", set: { submit: { variant: "primary" } }, tip: "Your progress is saved as you watch, so you can stop and come back later." },
    ],
    related: ["student-submit-assignment"],
  },
  {
    slug: "student-take-a-quiz",
    title: "Take a quiz",
    summary: "Start a quiz, answer each question, and see your score.",
    roles: S,
    category: "learning",
    format: "animated",
    path: "/dashboard/student/quizzes",
    where: "Sidebar → Quizzes",
    keywords: ["quiz", "test", "exam", "attempt", "score", "timer"],
    screens: {
      list: screen("student", "Quizzes", "Quizzes", [
        text("Published quizzes from all of your courses."),
        list("ql", [
          { id: "q1", title: "Chapter 3 Quiz", meta: "Algebra II · 10 questions · 20 min", badge: "Open" },
          { title: "Unit 1 Check-in", meta: "World History · 5 questions", badge: "Open" },
        ]),
      ]),
      take: screen("student", "Quizzes", "Chapter 3 Quiz", [
        row([badge("time", "Time Limit 20 min", "warning"), badge("att", "Attempts Allowed 2")]),
        card("qcard", "Question 1 of 10", [
          text("What are the roots of x² − 5x + 6 = 0?", false),
          list("opts", [
            { id: "o1", title: "x = 1 and x = 6" },
            { id: "o2", title: "x = 2 and x = 3" },
            { id: "o3", title: "x = −2 and x = −3" },
          ]),
        ]),
        row([small("prev", "Previous"), btn("next", "Next")], "between"),
      ]),
      done: screen("student", "Quizzes", "Quiz Submitted!", [
        stats([{ label: "Score", value: "85%", tone: "success" }, { label: "Correct", value: "8 / 10" }]),
        card("review", "Question Review", [list("r", [
          { title: "Q1 · Roots of x² − 5x + 6", badge: "Correct", tone: "success" },
          { title: "Q2 · Vertex form", badge: "Incorrect", tone: "danger", meta: "Explanation: complete the square first." },
        ])]),
      ]),
    },
    steps: [
      { title: "Open Quizzes", text: "Tap Quizzes in the sidebar to see every open quiz.", target: "nav:Quizzes" },
      { title: "Start", text: "Tap a quiz to open it. Check the time limit and how many attempts you have.", target: "q1" },
      { title: "Note the timer", text: "If there's a time limit, the clock starts when you begin.", screen: "take", target: "time" },
      { title: "Answer", text: "Choose an answer (or type one for short-answer and essay questions).", target: "o2", set: { o2: { badge: "Selected", tone: "primary" } } },
      { title: "Move on", text: "Use Next and Previous. Submit on the last question.", target: "next" },
      { title: "See your results", text: "If your teacher releases scores straight away, you'll see your score and a question review. Essay answers are marked by your teacher later.", screen: "done", target: "review" },
    ],
    troubleshoot: [{ problem: "It says I've used all my attempts", fix: "The quiz has an attempt limit. Ask your teacher if you need another try." }],
  },
  {
    slug: "student-grades-and-transcript",
    title: "Check your grades and transcript",
    summary: "See your recent grades, your GPA, and print an official transcript.",
    roles: S,
    category: "grades",
    format: "animated",
    path: "/dashboard/student/transcript",
    where: "Sidebar → Transcript",
    keywords: ["grades", "gpa", "transcript", "marks", "results", "pdf", "print"],
    screens: {
      dash: screen("student", "Overview", "Student Dashboard", [
        card("recent", "Recent Grades", [list("g", [
          { title: "Essay: The Silk Road", meta: "World History", badge: "88 / 100", tone: "success" },
          { title: "Problem set 2", meta: "Algebra II", badge: "18 / 20", tone: "success" },
        ]), row([small("full", "View Full Transcript")], "end")]),
      ]),
      tr: screen("student", "Transcript", "Official Academic Transcript", [
        row([stats([{ label: "Cumulative GPA", value: "3.6" }]), btn("print", "Print / Save as PDF", "outline", "print")], "between"),
        { k: "table", id: "tbl", cols: ["Course", "Term", "Grade"], rows: [["Algebra II", "Fall 2026", "A"], ["World History", "Fall 2026", "B+"]] },
        text("GPA Scale: A (90%+) · B (80%+) · C (70%+) · D (60%+) · F (below)"),
      ]),
    },
    steps: [
      { title: "Recent grades", text: "Your latest marks appear on the dashboard under Recent Grades.", target: "recent" },
      { title: "Open your transcript", text: "Tap View Full Transcript, or Transcript in the sidebar.", target: "full" },
      { title: "Your GPA", text: "Your cumulative GPA and each course's grade are listed by term.", screen: "tr", target: "tbl" },
      { title: "Save or print", text: "Tap Print / Save as PDF. In the print window choose Save as PDF.", target: "print", tip: "Anyone you send it to can verify a released transcript at /transcript." },
    ],
  },
  {
    slug: "student-live-class-checkin",
    title: "Join a live class and check in",
    summary: "Check in for attendance, then join the video class.",
    roles: S,
    category: "learning",
    format: "animated",
    where: "Overview → Live class today! / Course → Live",
    keywords: ["live", "video", "class", "attendance", "check in", "jitsi", "join"],
    screens: {
      dash: screen("student", "Overview", "Student Dashboard", [
        card("live", "Live class today!", [
          row([text("Algebra II · 2:00–3:00 PM", false), badge("lv", "LIVE", "danger")], "between"),
          row([btn("checkin", "Check In", "gold", "check")], "end"),
        ], undefined, "gold"),
        toast("ok", "Checked in"),
      ]),
      course: screen("student", "Overview", "Algebra II", [
        courseTabs(6),
        card("session", "Live Class in Progress", [text("Your teacher is live now."), row([btn("join", "Join Class", "primary", "video")])]),
      ]),
    },
    steps: [
      { title: "Spot today's class", text: "When a class is live today, a card appears on your dashboard.", target: "live" },
      { title: "Check in", text: "Tap Check In so your attendance is recorded.", target: "checkin", set: { ok: { open: true }, checkin: { label: "Checked in", variant: "outline" } } },
      { title: "Go to the Live tab", text: "Open the course and tap Live.", screen: "course", target: "ctabs:6" },
      { title: "Join", text: "Tap Join Class. The video call opens. Allow your camera and microphone.", target: "join", tip: "If it says No Active Session, your teacher hasn't started yet. Tap Check Again in a minute." },
    ],
  },
  {
    slug: "student-pay-tuition",
    title: "Pay your tuition",
    summary: "See your balance and pay online, in full or by installment.",
    roles: S,
    category: "payments",
    format: "animated",
    path: "/dashboard/student/tuition",
    where: "Sidebar → Tuition",
    keywords: ["tuition", "fees", "pay", "payment", "installments", "balance", "receipt", "stripe"],
    screens: {
      t: screen("student", "Tuition", "Tuition", [
        text("Your balance, payment schedule and receipts."),
        stats([{ label: "Total", value: "$4,500" }, { label: "Paid", value: "$1,500", tone: "success" }, { label: "Balance", value: "$3,000", tone: "warning" }], "bal"),
        card("plan", "Installment plan · 3 payments", [
          list("inst", [
            { title: "Payment 1", meta: "Sep 1", badge: "Paid", tone: "success" },
            { id: "p2", title: "Payment 2", meta: "Oct 1", badge: "Due", tone: "warning" },
            { title: "Payment 3", meta: "Nov 1", badge: "Upcoming" },
          ]),
          row([btn("pay", "Pay $1,500.00", "gold", "card")], "end"),
        ]),
      ]),
    },
    steps: [
      { title: "Open Tuition", text: "Tap Tuition in the sidebar.", target: "nav:Tuition" },
      { title: "Check your balance", text: "See your total, what you've paid, and what's left.", target: "bal" },
      { title: "See the schedule", text: "On an installment plan, each payment and its due date is listed.", target: "p2" },
      { title: "Pay", text: "Tap Pay. You're taken to a secure Stripe checkout, and your receipt appears here afterwards.", target: "pay", tip: "Paying by cash or bank transfer instead? Your school records it, and it shows as Paid." },
    ],
  },
  {
    slug: "student-certificates",
    title: "Get your certificates",
    summary: "View, download and share certificates for courses you complete.",
    roles: S,
    category: "grades",
    format: "animated",
    path: "/dashboard/student/certificates",
    where: "Sidebar → Certificates",
    keywords: ["certificate", "award", "completion", "download", "verify", "share"],
    screens: {
      list: screen("student", "Certificates", "My certificates", [
        list("certs", [{ id: "c1", title: "Algebra II", meta: "Issued Nov 20, 2026", badge: "View", tone: "gold" }]),
      ]),
      cert: screen("student", "Certificates", "Certificate", [
        { k: "certificate", id: "cert", name: "Amara Okafor", course: "Algebra II", school: "Westbrook Academy" },
        row([small("copy", "Copy verification link", "outline", "link"), btn("pdf", "Download PDF", "primary", "download")], "end"),
        toast("copied", "Link copied"),
      ]),
    },
    steps: [
      { title: "Open Certificates", text: "Tap Certificates in the sidebar. Certificates appear when you complete and pass a course.", target: "nav:Certificates" },
      { title: "View one", text: "Tap View to open your certificate.", target: "c1" },
      { title: "Download", text: "Tap Download PDF. In the print window choose Save as PDF.", screen: "cert", target: "pdf" },
      { title: "Share proof", text: "Copy verification link lets employers or schools check it's genuine.", target: "copy", set: { copied: { open: true } } },
    ],
    troubleshoot: [{ problem: "I finished but there's no certificate", fix: "Your school may approve certificates by hand, or you may not have reached the pass mark yet. Ask your school office." }],
  },
  {
    slug: "student-progress-report",
    title: "Read your progress report",
    summary: "One page with your grades, attendance, missing and late work.",
    roles: STUDENT_ONLY,
    category: "grades",
    format: "steps",
    path: "/reports/students/me",
    where: "Sidebar → Progress report",
    keywords: ["progress", "report", "missing work", "attendance", "average"],
    steps: [
      { title: "Open it", text: "Tap Progress report in the sidebar." },
      { title: "Read the summary", text: "See your average grade, attendance, completion, and how many submissions were late." },
      { title: "Fix missing work", text: "The Missing work list shows what's still to do. Submit those first." },
      { title: "Print or export", text: "Use Print or CSV to keep a copy." },
    ],
  },
];
