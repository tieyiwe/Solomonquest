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
    ],
  },
  {
    id: "users",
    title: "Managing Users",
    icon: "👥",
    articles: [
      {
        id: "invite-teacher",
        title: "Invite a teacher or staff member",
        icon: "✉️",
        summary: "Send an email invitation so teachers and staff can create their account.",
        steps: [
          { text: "Go to Users in the left sidebar." },
          { text: "Click the Invite button (top right)." },
          { text: "Enter the person's email address and select their role (Teacher or Staff)." },
          { text: "Click Send Invitation. They receive an email with an Accept button.", detail: "The link expires after 7 days. You can resend from the Invitations tab." },
          { text: "Once they accept, their account appears in the Users list." },
        ],
        troubleshoot: [
          { problem: "Invitation email not received", solution: "Ask the recipient to check their spam folder. You can also resend the invitation from Users → Invitations tab." },
          { problem: "Teacher can't see their courses after accepting", solution: "Go to Courses and verify the teacher is assigned to the course." },
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

// ─── Role selector ────────────────────────────────────────────────────────────

export type HelpRole = "admin" | "super_admin" | "teacher" | "student" | "staff";

export function getHelpData(role?: HelpRole | null): HelpCategory[] {
  if (role === "admin" || role === "super_admin") return adminHelp;
  if (role === "teacher") return teacherHelp;
  if (role === "staff") return staffHelp;
  return studentHelp;
}
