import type { Guide } from "../types";
import { area, btn, card, check, field, list, row, screen, small, tabs, text, toast } from "../mock";

const V = ["visitor"] as const;

export const visitorGuides: Guide[] = [
  {
    slug: "find-a-school",
    title: "Find your school",
    summary: "Search for your school on SolomonQuest and open its public page.",
    roles: [...V],
    category: "start",
    format: "animated",
    path: "/onboarding/join",
    where: "Home page → Join a School",
    keywords: ["search", "school page", "explore", "join"],
    screens: {
      home: screen("public", undefined, "Education, Elevated.", [
        text("Courses, community & admissions for schools and ministries.", true),
        row([btn("create", "Create a School", "outline"), btn("join", "Join a School", "gold")]),
        card("explore", "Explore Schools", [list("schools", [
          { title: "Westbrook Academy", meta: "View programs and apply", badge: "Featured", tone: "gold" },
          { title: "Harbor Bible Institute", meta: "View programs and apply" },
        ])]),
      ]),
      join: screen("public", undefined, "Join a School", [
        text("Find your school below, then create your student account."),
        field("search", "Search", undefined, "Search schools by name..."),
        list("results", [
          { id: "r1", title: "Westbrook Academy", meta: "westbrook · 12 courses", icon: "book" },
          { id: "r2", title: "Westfield College", meta: "westfield · 8 courses", icon: "book" },
        ]),
      ]),
      page: screen("public", undefined, "Westbrook Academy", [
        text("Empowering minds, shaping futures"),
        row([btn("apply-now", "Apply Now", "gold"), small("courses", "Courses")]),
        card("avail", "Available Courses", [list("c", [
          { title: "Algebra II", meta: "MATH-201", badge: "Enroll" },
          { title: "World History", meta: "HIS-110", badge: "Enroll" },
        ])]),
      ]),
    },
    steps: [
      { title: "Start on the home page", text: "Go to the SolomonQuest home page and tap Join a School.", target: "join" },
      { title: "Search by name", text: "Type part of your school's name. Results update as you type.", screen: "join", target: "search", set: { search: { value: "Westbrook" } } },
      { title: "Pick your school", text: "Tap your school to open its public page.", target: "r1" },
      { title: "Explore and apply", text: "You'll see the school's courses and an Apply Now button. Your school may also share a direct link such as solomonquest.com/your-school.", screen: "page", target: "apply-now", tip: "Can't find it? Your school may not have a public page yet. Ask them for an invitation link instead." },
    ],
    related: ["apply-to-a-school", "accept-an-invite"],
  },
  {
    slug: "apply-to-a-school",
    title: "Apply to a school",
    summary: "Choose courses, fill in the application form, review and submit.",
    roles: [...V, "student"],
    category: "start",
    format: "animated",
    where: "School page → Apply Now",
    keywords: ["application", "admissions", "enroll", "apply now"],
    screens: {
      apply: screen("public", undefined, "Apply to Westbrook Academy", [
        tabs("wiz", ["Choose Courses", "Application Form", "Review & Submit"], 0),
        card("sel", "Select Courses", [
          text("Choose one or more courses you would like to enroll in."),
          check("c1", "Algebra II · MATH-201"),
          check("c2", "World History · HIS-110"),
        ]),
        row([btn("continue", "Continue")], "end"),
      ]),
      form: screen("public", undefined, "Apply to Westbrook Academy", [
        tabs("wiz2", ["Choose Courses", "Application Form", "Review & Submit"], 1),
        card("af", "Application Form", [
          field("fullname", "Full Name"),
          area("why", "Why do you want to join?"),
          area("msg", "Message (optional)", undefined, "Introduce yourself or share any relevant information..."),
        ]),
        row([btn("review", "Review Application")], "end"),
      ]),
      review: screen("public", undefined, "Review Your Application", [
        tabs("wiz3", ["Choose Courses", "Application Form", "Review & Submit"], 2),
        card("rv", "Review & Submit", [list("sum", [
          { title: "Algebra II", meta: "Selected course" },
          { title: "Full Name", meta: "Amara Okafor" },
        ]), text("Please review your application before submitting.")]),
        row([btn("submit", "Submit Application", "gold")], "end"),
        toast("done", "Application submitted"),
      ]),
    },
    steps: [
      { title: "Open the application", text: "On the school's page, tap Apply Now. You'll be asked to log in or sign up first. It's free.", target: "wiz:0", tip: "Applications can be closed between intakes. The page will say so if they are." },
      { title: "Choose your courses", text: "Tick one or more courses.", target: "c1", set: { c1: { on: true } } },
      { title: "Continue", text: "Tap Continue to go to the form.", target: "continue" },
      { title: "Fill in the form", text: "Answer the school's questions. Fields marked * are required.", screen: "form", target: "fullname", set: { fullname: { value: "Amara Okafor" } } },
      { title: "Tell them about you", text: "Add a short note about why you want to join.", target: "why", set: { why: { value: "I want to grow in mathematics." } } },
      { title: "Review", text: "Tap Review Application and check everything.", target: "review" },
      { title: "Submit", text: "Tap Submit Application. You'll get a notification when the school reviews it.", screen: "review", target: "submit", set: { done: { open: true } } },
    ],
    troubleshoot: [
      { problem: "It says Login Required", fix: "Sign up (or log in), then come back to the school's page. Your selections are kept." },
      { problem: "I can't see any courses", fix: "The school hasn't published courses for applicants yet. Contact the school directly." },
    ],
    related: ["find-a-school", "accept-an-invite"],
  },
  {
    slug: "accept-an-invite",
    title: "Accept an invitation",
    summary: "Joined by email? Open the invite link and create your password.",
    roles: [...V, "student", "teacher", "staff", "parent"],
    category: "start",
    format: "animated",
    where: "Invitation email → Accept Invitation",
    keywords: ["invite", "invitation", "join", "email link", "create account", "password"],
    screens: {
      invite: screen("public", undefined, "You're invited!", [
        text("Join Westbrook Academy on SolomonQuest"),
        card("f", undefined, [
          row([field("first", "First Name", undefined, "Jane"), field("last", "Last Name", undefined, "Smith")]),
          field("email", "Email", "you@example.com"),
          field("phone", "Phone Number", undefined, "+1 (555) 000-0000"),
          { k: "field", id: "pw", label: "Create Password", placeholder: "••••••••", type: "password" },
          btn("join", "Accept Invitation & Create Account", "gold"),
        ]),
        toast("welcome", "Welcome to Westbrook Academy"),
      ]),
    },
    steps: [
      { title: "Open the email", text: "Your school sends an email invitation. Tap the Accept Invitation button in it.", target: "f", tip: "Invites expire. If yours has, ask your school to send a new one." },
      { title: "Your name", text: "Enter your first and last name.", target: "first", set: { first: { value: "Amara" }, last: { value: "Okafor" } } },
      { title: "Email is filled in", text: "The invite already knows your email, so there's nothing to type.", target: "email" },
      { title: "Choose a password", text: "Pick a password with at least 8 characters.", target: "pw", set: { pw: { value: "mysecret1" } } },
      { title: "Join", text: "Tap Accept Invitation & Create Account. You land on your dashboard, and a short guided tour shows you around.", target: "join", set: { welcome: { open: true } } },
    ],
    troubleshoot: [
      { problem: "It says Invitation Invalid", fix: "The link was already used or expired. Ask your school administrator for a new invitation." },
      { problem: "I already have an account", fix: "Sign in with the same email. The invitation adds the new school to your account." },
    ],
    related: ["sign-in-and-reset-password"],
  },
  {
    slug: "sign-in-and-reset-password",
    title: "Sign in, or reset a forgotten password",
    summary: "How to log in, and what to do if you forget your password.",
    roles: [...V, "student", "teacher", "admin", "staff", "parent"],
    category: "start",
    format: "steps",
    path: "/auth/login",
    where: "Top right → Sign In",
    keywords: ["login", "log in", "forgot password", "reset", "locked out"],
    steps: [
      { title: "Open Sign In", text: "Tap Sign In at the top right of any SolomonQuest page." },
      { title: "Enter your details", text: "Type the email and password you used when you joined, then tap Sign In." },
      { title: "Forgot your password?", text: "Tap Forgot password?, enter your email address and tap Send reset link.", tip: "The email can take a minute. Check your spam folder too." },
      { title: "Set a new password", text: "Open the link in the email and choose a new password. You're signed in straight away." },
    ],
    troubleshoot: [
      { problem: "I don't get the reset email", fix: "Make sure you typed the email your school invited. If it still doesn't arrive, ask your school admin. They can send a reset from Users → Reset Password." },
    ],
  },
  {
    slug: "request-a-school",
    title: "Start a new school on SolomonQuest",
    summary: "Create an account and request your own school space.",
    roles: [...V],
    category: "start",
    format: "steps",
    path: "/onboarding/setup",
    where: "Home page → Create a School",
    keywords: ["create school", "new school", "register", "request"],
    steps: [
      { title: "Create a School", text: "On the home page tap Create a School, then sign up with your name, email and password." },
      { title: "Request a school", text: "Fill in Your Full Name, Phone Number, Suggested School Name, and Reason & Goal for This School." },
      { title: "Wait for approval", text: "The SolomonQuest team reviews requests. You'll see Request submitted until then." },
      { title: "Go to your dashboard", text: "When it's approved, tap Go to dashboard. You're the school's admin and can start setting it up.", tip: "Next, see the guide Set up your school's branding." },
    ],
    related: ["admin-branding", "admin-invite-people"],
  },
];
