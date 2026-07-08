export interface HelpStep {
  text: string;
  detail?: string;
}

export interface HelpArticle {
  id: string;
  title: string;
  icon: string;
  summary: string;
  steps: HelpStep[];
  troubleshoot?: { problem: string; solution: string }[];
}

export interface HelpCategory {
  id: string;
  title: string;
  icon: string;
  articles: HelpArticle[];
}

// ─── ADMIN HELP ───────────────────────────────────────────────────────────────

export const adminHelp: HelpCategory[] = [
  {
    id: "school-setup",
    title: "School Setup",
    icon: "🏫",
    articles: [
      {
        id: "branding",
        title: "Set up school branding",
        icon: "🎨",
        summary: "Upload your logo, banner image, and choose a primary colour for your school.",
        steps: [
          { text: "Go to Settings in the left sidebar." },
          { text: "Click the Branding tab at the top of the page." },
          { text: "Upload your Logo — this appears as a circular avatar on school cards.", detail: "Recommended: 200×200px PNG with transparent background." },
          { text: "Upload a Banner image — this is the full-width cover shown on the homepage Explore Schools card.", detail: "Recommended: 1200×400px landscape image." },
          { text: "Pick a Primary Colour using the colour picker.", detail: "This colour is used for buttons, highlights, and the school card background." },
          { text: "Click Save Changes. Your branding is live immediately." },
        ],
        troubleshoot: [
          { problem: "Banner isn't showing on the homepage", solution: "Make sure your school is listed publicly (Settings → Visibility). Also confirm the banner URL uploaded correctly — it should start with https://." },
          { problem: "Logo looks blurry", solution: "Upload a higher-resolution image — at least 200×200px. PNG files with transparent backgrounds look best." },
        ],
      },
      {
        id: "domain",
        title: "Configure your school slug",
        icon: "🔗",
        summary: "Your school slug appears in the public URL (e.g. /schools/my-school).",
        steps: [
          { text: "Go to Settings → General." },
          { text: "Find the School Slug field." },
          { text: "Enter a short, URL-safe name (lowercase letters, numbers, hyphens only)." },
          { text: "Click Save. The public school page is now live at /schools/your-slug." },
        ],
        troubleshoot: [
          { problem: "Slug field is greyed out", solution: "Only the school owner (the account that created the school) can change the slug." },
        ],
      },
      {
        id: "custom-domain",
        title: "Connect your own domain",
        icon: "🌐",
        summary: "Use your own domain (e.g. school.edu) for your public page instead of the shared SolomonQuest URL.",
        steps: [
          { text: "Go to Settings → Branding, then open the Custom Domain tab." },
          { text: "Enter your domain (e.g. school.edu) and click Connect Domain." },
          { text: "Two DNS records appear — a CNAME and a TXT record." },
          { text: "Log in to wherever you manage DNS for your domain (GoDaddy, Namecheap, Cloudflare, Google Domains, etc.) and add both records exactly as shown." },
          { text: "DNS changes can take a few minutes to a few hours to take effect." },
          { text: "Come back and click Verify DNS Records. Once both records are found, your domain goes live automatically." },
        ],
        troubleshoot: [
          { problem: "Verification keeps failing", solution: "Double-check the TXT record's host and value were copied exactly — a common mistake is leaving out the leading underscore, or your registrar auto-appending your domain a second time." },
          { problem: "It's been a day and it still won't verify", solution: "Some registrars take longer to propagate DNS changes. You can check propagation with any public 'DNS lookup' tool by searching your domain's TXT records." },
        ],
      },
    ],
  },
  {
    id: "users",
    title: "Managing Users",
    icon: "👥",
    articles: [
      {
        id: "invite-teacher",
        title: "Invite a teacher, staff member, or transferring student",
        icon: "✉️",
        summary: "Send an email invitation so teachers, staff, or already-enrolled-elsewhere students can create their account directly.",
        steps: [
          { text: "Go to Users in the left sidebar." },
          { text: "Pick the Teachers, Students, or Staff tab, then click the Invite button." },
          { text: "Enter the person's email address." },
          { text: "Click Send Invitation. They receive an email with an Accept button.", detail: "The link expires after 7 days. Check the Invitations tab for status." },
          { text: "Once they accept, their account appears in the Users list under the matching role." },
        ],
        troubleshoot: [
          { problem: "Invitation email not received", solution: "Ask the recipient to check their spam folder. You can also resend the invitation from Users → Invitations tab." },
          { problem: "Teacher can't see their courses after accepting", solution: "Go to Courses and verify the teacher is assigned to the course." },
          { problem: "New invitation isn't showing up in the Invitations tab yet", solution: "The list refreshes when you open the Invitations tab — switch to another tab and back, or reload the page." },
        ],
      },
      {
        id: "manage-students",
        title: "View and manage students",
        icon: "🎓",
        summary: "See all enrolled students, view their profiles, and update their details.",
        steps: [
          { text: "Go to Users → Students tab." },
          { text: "Use the search bar to find a student by name or ID." },
          { text: "Click a student's row to open their profile." },
          { text: "From the profile you can view grades, enrolled courses, and contact info." },
        ],
      },
    ],
  },
  {
    id: "courses",
    title: "Courses",
    icon: "📚",
    articles: [
      {
        id: "create-course",
        title: "Create a new course",
        icon: "➕",
        summary: "Set up a course, assign a teacher, and enroll students.",
        steps: [
          { text: "Go to Courses → New Course." },
          { text: "Fill in the course name, description, and subject." },
          { text: "Assign a teacher from the dropdown." },
          { text: "Set the start and end dates." },
          { text: "Click Create Course." },
          { text: "To enroll students, open the course and go to the Students tab, then click Add Students." },
        ],
      },
    ],
  },
  {
    id: "admissions",
    title: "Admissions",
    icon: "📋",
    articles: [
      {
        id: "review-applications",
        title: "Review and approve applications",
        icon: "✅",
        summary: "Process applications from prospective students.",
        steps: [
          { text: "Go to Admissions in the sidebar." },
          { text: "Applications are listed with status: Pending, Approved, or Rejected." },
          { text: "Click an applicant's row to view their full application." },
          { text: "Click Approve to convert them to an enrolled student, or Reject to decline." },
          { text: "Approved applicants receive an email notification and can log in to their student dashboard." },
        ],
        troubleshoot: [
          { problem: "Approved student can't log in", solution: "The student needs to complete registration first. Check if they received the approval email and clicked the setup link." },
        ],
      },
      {
        id: "set-tuition",
        title: "Set tuition for a course or program",
        icon: "💵",
        summary: "Set a tuition amount per course or per program, and choose which payment options students can use.",
        steps: [
          { text: "Open the course (Courses -> edit) or program (Programs -> edit) you want to set tuition for." },
          { text: "Scroll to the Tuition section at the bottom of the edit form." },
          { text: "Enter the tuition amount." },
          { text: "Turn on Allow Full Payment, Allow Installments, or both — students choose between whichever you enable." },
          { text: "If installments are on, set how many installments to split the total into." },
          { text: "Click Save Tuition." },
        ],
        troubleshoot: [
          { problem: "Students aren't being asked to pay", solution: "Tuition + payment is currently informational only while it's being tested — it's not yet a requirement to submit an application or complete enrollment. That gate will be turned on later." },
        ],
      },
    ],
  },
  {
    id: "programs",
    title: "Programs",
    icon: "🎓",
    articles: [
      {
        id: "create-program",
        title: "Group courses into a program",
        icon: "🗂️",
        summary: "Create a program and assign courses to it so enrollment and chat work across the whole program.",
        steps: [
          { text: "Go to Programs in the sidebar and click Create Program." },
          { text: "Give it a name, code, and level, then save." },
          { text: "Go to Courses and open a course's edit form." },
          { text: "Pick the program from the Program dropdown and save." },
          { text: "Repeat for every course that belongs to the same program." },
        ],
        troubleshoot: [
          { problem: "A student is only enrolled in one course, not the whole program", solution: "Program-wide auto-enrollment triggers the next time they're enrolled in any course of that program — re-approve their application or re-run the enroll action if the course was added to the program after they already enrolled." },
        ],
      },
      {
        id: "program-chat",
        title: "How program-wide chat works",
        icon: "💬",
        summary: "Every student enrolled anywhere in a program automatically shares one chat channel.",
        steps: [
          { text: "The first time a student is enrolled in any course of a program, a shared chat channel for that program is created automatically." },
          { text: "Every other student enrolled in any course of that program is added to the same channel." },
          { text: "Students can find it in Chat alongside their other channels and DMs." },
        ],
      },
    ],
  },
  {
    id: "ai-and-productivity",
    title: "AI Assistant & Notes",
    icon: "🤖",
    articles: [
      {
        id: "solomon-agent",
        title: "Chat with Solomon, your AI assistant",
        icon: "✨",
        summary: "Solomon can answer questions and take actions in the platform on your behalf.",
        steps: [
          { text: "Look for the floating chat button in the bottom corner of any admin/teacher dashboard page." },
          { text: "Click it to open Solomon and type your question or request." },
          { text: "Solomon can look up information and, for some requests, take an action directly (like drafting a broadcast message)." },
        ],
        troubleshoot: [
          { problem: "The assistant isn't responding", solution: "The AI assistant requires an API key to be configured by your platform administrator. Contact support if it stays unavailable." },
        ],
      },
      {
        id: "notes",
        title: "Take notes and share them",
        icon: "🗒️",
        summary: "Keep private notes, turn them into on-screen sticky notes, or share one with a colleague.",
        steps: [
          { text: "Click the notes icon (next to the AI assistant button) to open your notes list." },
          { text: "Click New Note to create one, or click an existing note to edit it." },
          { text: "Toggle Sticky Mode to pin a note as a small floating window on your screen." },
          { text: "Click Share on a note to give another user view or edit access." },
        ],
      },
    ],
  },
];

// ─── TEACHER HELP ─────────────────────────────────────────────────────────────

export const teacherHelp: HelpCategory[] = [
  {
    id: "courses",
    title: "Teaching Courses",
    icon: "📖",
    articles: [
      {
        id: "add-material",
        title: "Add lesson materials to a course",
        icon: "📎",
        summary: "Upload files, links, and videos for students to access.",
        steps: [
          { text: "Click your course name in the sidebar under My Courses." },
          { text: "Go to the Materials tab." },
          { text: "Click Add Material." },
          { text: "Choose the type: File, Link, or Video.", detail: "Files: PDF, Word, PPT. Videos: paste a YouTube/Vimeo URL or upload directly." },
          { text: "Give it a title and click Save." },
          { text: "Students can see it immediately in their course page." },
        ],
      },
      {
        id: "video-assignment",
        title: "Create a required-watch video assignment",
        icon: "🎬",
        summary: "Upload a video that students must watch in full before they can proceed.",
        steps: [
          { text: "Open your course from the sidebar." },
          { text: "Go to Assignments → New Assignment." },
          { text: "Select Video Watch as the assignment type." },
          { text: "Upload your video or paste a hosted URL." },
          { text: "Enable the Require full watch toggle — this prevents skipping.", detail: "Students cannot skip ahead. The progress bar is locked until the video plays to the end." },
          { text: "Optionally add a follow-up quiz or submission that unlocks after the video." },
          { text: "Click Publish." },
        ],
        troubleshoot: [
          { problem: "Students say the video keeps pausing", solution: "Large video files can cause buffering. Compress the video to under 500 MB or use a hosted URL (YouTube unlisted / Vimeo)." },
        ],
      },
    ],
  },
  {
    id: "grading",
    title: "Grading & Feedback",
    icon: "📝",
    articles: [
      {
        id: "grade-assignment",
        title: "Grade a student submission",
        icon: "✏️",
        summary: "Review and score submitted assignments.",
        steps: [
          { text: "Go to Assignments in the sidebar." },
          { text: "Click the assignment you want to grade." },
          { text: "You'll see a list of students and their submission status." },
          { text: "Click a student's name to open their submission." },
          { text: "Enter a score and optional feedback comment." },
          { text: "Click Save Grade. The student is notified automatically." },
        ],
        troubleshoot: [
          { problem: "Grade field won't save", solution: "Make sure the score is within the maximum points set when you created the assignment." },
        ],
      },
      {
        id: "gradebook",
        title: "Use the Gradebook",
        icon: "📊",
        summary: "View and edit all grades in a spreadsheet-style matrix.",
        steps: [
          { text: "Click Gradebook in the sidebar." },
          { text: "Select the course from the dropdown at the top." },
          { text: "You'll see a grid: students as rows, assignments as columns." },
          { text: "Click any cell to enter or edit a grade." },
          { text: "Press Enter or click elsewhere to save." },
          { text: "The last column shows each student's running average." },
        ],
      },
    ],
  },
  {
    id: "communication",
    title: "Communication",
    icon: "💬",
    articles: [
      {
        id: "post-forum",
        title: "Post a forum announcement",
        icon: "📣",
        summary: "Share updates and start discussions with your students.",
        steps: [
          { text: "Go to Forum from the top navigation." },
          { text: "Click New Topic." },
          { text: "Enter a title and your message content." },
          { text: "Optionally add a cover image URL for the post thumbnail." },
          { text: "Tick Pin to top if it's an important announcement." },
          { text: "Click Post. All students in your school can see and reply." },
        ],
      },
      {
        id: "chat-basics",
        title: "Message students and start video calls",
        icon: "💬",
        summary: "Chat one-on-one, in group channels, or start an in-app video call that rings the other person.",
        steps: [
          { text: "Go to Chat from the top navigation." },
          { text: "Pick an existing DM/channel, or start a new one from the + button." },
          { text: "Type a message and hit Enter, or click the paperclip to attach a document or image.", detail: "Attachments are automatically scanned before they're sent — unsafe or unsupported files are blocked." },
          { text: "Click Reply under any message to reply in a thread — it opens right under that message, no separate panel." },
          { text: "Click the video icon to start a call. It rings the other person (or the whole channel, for group chats) so they can join or decline." },
        ],
        troubleshoot: [
          { problem: "My attachment was rejected", solution: "Only common document and image types are allowed, and files are scanned for malicious content before sending. Try a different file format." },
          { problem: "The other person didn't get my message", solution: "As long as they're a member of the channel, they get an in-app notification and — unless they've turned it off in Notification Preferences — an email too, even if they weren't online." },
        ],
      },
    ],
  },
  {
    id: "ai-and-productivity",
    title: "AI Assistant & Notes",
    icon: "🤖",
    articles: [
      {
        id: "solomon-agent",
        title: "Chat with Solomon, your AI assistant",
        icon: "✨",
        summary: "Solomon can answer questions and help with routine tasks.",
        steps: [
          { text: "Look for the floating chat button in the bottom corner of your dashboard." },
          { text: "Click it to open Solomon and type your question or request." },
        ],
      },
      {
        id: "notes",
        title: "Take notes and share them",
        icon: "🗒️",
        summary: "Keep private notes, pin one as a sticky note, or share one with a colleague.",
        steps: [
          { text: "Click the notes icon next to the AI assistant button." },
          { text: "Click New Note, or open an existing one to edit it." },
          { text: "Toggle Sticky Mode to pin it as a small floating window on screen." },
          { text: "Click Share to give another user view or edit access to a note." },
        ],
      },
    ],
  },
];

// ─── STUDENT HELP ─────────────────────────────────────────────────────────────

export const studentHelp: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "🚀",
    articles: [
      {
        id: "find-courses",
        title: "Find and access your courses",
        icon: "🔍",
        summary: "See all the courses you're enrolled in.",
        steps: [
          { text: "Log in and go to your Student Dashboard." },
          { text: "Your enrolled courses are listed on the Overview page." },
          { text: "Click a course card to open it." },
          { text: "Inside you'll find Materials, Assignments, and live session links." },
        ],
        troubleshoot: [
          { problem: "A course I'm supposed to be in doesn't appear", solution: "Contact your school administrator — you may not have been added to that course's enrollment list yet." },
        ],
      },
      {
        id: "tuition-payment",
        title: "Pay tuition during enrollment",
        icon: "💵",
        summary: "If a school has set tuition for a course, you'll see it at the review step of your application.",
        steps: [
          { text: "When applying to a school, the last step (Review & Submit) shows a Tuition & Payment section if the school has set a price for any course you selected." },
          { text: "Choose Pay in Full or, if offered, split it into installments." },
          { text: "This is optional for now — you can still submit your application and pay later." },
        ],
      },
      {
        id: "update-profile",
        title: "Update your profile",
        icon: "👤",
        summary: "Add a photo and keep your contact information current.",
        steps: [
          { text: "Click your name or avatar in the top right corner." },
          { text: "Select Profile Settings." },
          { text: "Upload a profile photo and update your name or phone number." },
          { text: "Click Save Changes." },
        ],
      },
    ],
  },
  {
    id: "assignments",
    title: "Assignments & Submissions",
    icon: "📝",
    articles: [
      {
        id: "submit-assignment",
        title: "Submit an assignment",
        icon: "📤",
        summary: "Upload your work before the deadline.",
        steps: [
          { text: "Go to Assignments in the sidebar." },
          { text: "Click the assignment title." },
          { text: "Read the instructions carefully." },
          { text: "Click Submit / Upload and attach your file or enter your text." },
          { text: "Click Submit. You'll see a confirmation and receive an email receipt." },
          { text: "You can re-submit up until the deadline if your teacher allows it." },
        ],
        troubleshoot: [
          { problem: "Submit button is greyed out", solution: "The deadline has passed, or your teacher has not yet opened submissions. Check the due date shown on the assignment." },
          { problem: "File upload fails", solution: "File size limit is 50 MB. Compress your file or use a Google Drive link and paste it in the text submission box." },
        ],
      },
      {
        id: "watch-video",
        title: "Watch a required video assignment",
        icon: "▶️",
        summary: "Some assignments require you to watch a video in full before you can proceed.",
        steps: [
          { text: "Open the assignment from your Assignments list." },
          { text: "Press Play — the video cannot be skipped." },
          { text: "Watch the entire video. The progress bar shows how much is left.", detail: "Attempting to skip ahead will reset the video to where you were." },
          { text: "When the video ends, the next step (quiz or submission) unlocks automatically." },
        ],
        troubleshoot: [
          { problem: "Video won't load", solution: "Check your internet connection. Try refreshing the page. If the issue persists, contact your teacher." },
          { problem: "The next step didn't unlock after I finished", solution: "Refresh the page. If still locked, your teacher may have a server-side watch check — contact them directly." },
        ],
      },
      {
        id: "take-quiz",
        title: "Take a quiz",
        icon: "🧠",
        summary: "Answer quiz questions and submit for automatic grading.",
        steps: [
          { text: "Go to Assignments and click the quiz." },
          { text: "Click Start Quiz." },
          { text: "Answer each question. You can go back and change answers before submitting." },
          { text: "Click Submit Quiz when done. Your score appears immediately." },
        ],
        troubleshoot: [
          { problem: "Quiz timer ran out before I finished", solution: "Timed quizzes submit automatically when time is up. Whatever answers you entered are saved." },
        ],
      },
    ],
  },
  {
    id: "grades",
    title: "Grades & Transcript",
    icon: "🏆",
    articles: [
      {
        id: "view-grades",
        title: "View your grades",
        icon: "📊",
        summary: "See feedback and scores for each assignment.",
        steps: [
          { text: "Go to Assignments and click a graded assignment." },
          { text: "Your score and teacher feedback appear at the top." },
          { text: "For a full grade summary, go to Dashboard → Transcript." },
        ],
      },
      {
        id: "download-transcript",
        title: "Download your transcript",
        icon: "📄",
        summary: "Export your official grades as a PDF.",
        steps: [
          { text: "Go to Transcript in the sidebar." },
          { text: "Review your course grades." },
          { text: "Click Download PDF." },
          { text: "Share the PDF or the verification link with institutions that need it." },
        ],
      },
    ],
  },
  {
    id: "chat",
    title: "Chat & Notifications",
    icon: "💬",
    articles: [
      {
        id: "chat-basics",
        title: "Message classmates and teachers",
        icon: "💬",
        summary: "Chat one-on-one, in group channels, or join a video call.",
        steps: [
          { text: "Go to Chat from the top navigation." },
          { text: "Pick a DM or channel, or start a new one." },
          { text: "Type a message, or click the paperclip to send a document or image.", detail: "Attachments are scanned for safety before they're sent." },
          { text: "Click Reply under a message to reply in a thread — it opens directly under that message." },
          { text: "If you're enrolled in a program with multiple courses, you're automatically added to that program's shared chat with everyone else enrolled in it." },
          { text: "When someone starts a video call, an incoming call banner appears — click to join or decline." },
        ],
      },
      {
        id: "notifications",
        title: "Manage your notifications",
        icon: "🔔",
        summary: "Choose what you get notified about, in-app and by email.",
        steps: [
          { text: "Click the bell icon to see recent notifications and unread messages." },
          { text: "Click View all notifications to see your full notification history." },
          { text: "Go to Settings → Notification Preferences to turn specific categories (chat, grades, assignments, etc.) on or off, and choose whether you get emailed when you're offline." },
        ],
      },
    ],
  },
];

// ─── STAFF HELP ───────────────────────────────────────────────────────────────

export const staffHelp: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "🚀",
    articles: [
      {
        id: "accept-invite",
        title: "How did I get access?",
        icon: "✉️",
        summary: "Your administrator invited you via email.",
        steps: [
          { text: "You received an invitation email from your school administrator." },
          { text: "You clicked Accept Invitation and created your account with email, phone, and password." },
          { text: "Your account was automatically linked to your school as a Staff member." },
          { text: "You can now log in at any time using your email and password." },
        ],
      },
    ],
  },
  ...studentHelp.slice(1),
];

// ─── SUPER ADMIN HELP (platform-wide, on top of admin help) ──────────────────

export const superAdminHelp: HelpCategory[] = [
  {
    id: "platform-management",
    title: "Platform Administration",
    icon: "🛡️",
    articles: [
      {
        id: "super-admin-dashboard",
        title: "Find your way around the platform console",
        icon: "🧭",
        summary: "The Super Admin console at /super_admin manages every school on the platform.",
        steps: [
          { text: "Go to /super_admin (or Profile menu -> Platform Admin)." },
          { text: "Dashboard and Analytics give a cross-school overview: schools, users, courses, enrollments, growth this month." },
          { text: "Schools lists every school with owner, plan, and status — click Features to manage what's turned on for that school, or Deactivate/Delete as needed." },
          { text: "All Users lets you search and manage any user platform-wide, including role changes and suspensions." },
        ],
      },
      {
        id: "domain-requests",
        title: "Approve a school's custom domain request",
        icon: "🌐",
        summary: "School admins submit a domain; you add it to hosting and approve it.",
        steps: [
          { text: "Go to Domain Requests — you'll also get a notification when a school submits one." },
          { text: "Add the requested domain in your hosting provider's domain settings (this is a manual step outside the app)." },
          { text: "Click Approve — this generates the DNS records and notifies the school admin to finish connecting it." },
        ],
      },
      {
        id: "subscriptions",
        title: "Manage plans and subscriptions",
        icon: "💳",
        summary: "Track each school's plan, billing status, and monthly price — the sales source of truth until a payment processor is wired up.",
        steps: [
          { text: "Go to Subscriptions to see total MRR and a breakdown by status (active, trialing, past due, canceled)." },
          { text: "Click Edit on any school to change its plan, status, monthly price, or trial end date." },
        ],
      },
      {
        id: "feature-flags",
        title: "Turn a feature on or off for one school",
        icon: "🎛️",
        summary: "Disable a module (chat, video calls, AI assistant, etc.) for a specific school without touching code.",
        steps: [
          { text: "Go to Schools and click Features next to the school." },
          { text: "Toggle any module off — the AI assistant enforces this immediately; other modules are tracked here for future enforcement." },
          { text: "Click Save." },
        ],
      },
      {
        id: "deletion-and-archive",
        title: "Review deletion requests and the archive",
        icon: "🗑️",
        summary: "School deletions go through an approval step and a 30-day recovery window.",
        steps: [
          { text: "Deletion Requests shows schools an admin asked to delete — Approve archives a snapshot, Reject keeps the school active." },
          { text: "Archive lists archived schools with days remaining before permanent deletion, and a Restore button." },
        ],
      },
      {
        id: "audit-log",
        title: "Check the audit log",
        icon: "📜",
        summary: "Every platform-level action (role changes, deletions, approvals) is recorded here with who did it and when.",
        steps: [
          { text: "Go to Audit Log." },
          { text: "Filter by actor, action type, target type, or date range." },
        ],
      },
    ],
  },
];

// ─── Role selector ────────────────────────────────────────────────────────────

export type HelpRole = "admin" | "super_admin" | "teacher" | "student" | "staff";

export function getHelpData(role?: HelpRole | null): HelpCategory[] {
  if (role === "super_admin") return [...superAdminHelp, ...adminHelp];
  if (role === "admin") return adminHelp;
  if (role === "teacher") return teacherHelp;
  if (role === "staff") return staffHelp;
  return studentHelp;
}
