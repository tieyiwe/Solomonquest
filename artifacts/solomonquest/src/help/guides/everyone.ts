import type { Audience, Guide, MockEl } from "../types";
import { area, btn, card, chat, dialog, field, list, menu, row, screen, select, small, tabs, text, toast, toggle } from "../mock";

const ALL: Audience[] = ["student", "teacher", "admin", "staff", "parent", "super_admin"];
const NO_PARENT: Audience[] = ["student", "teacher", "admin", "staff", "super_admin"];

const accountMenu: MockEl = menu("acct", [
  { id: "m-profile", label: "My Profile", icon: "user" },
  { id: "m-notif", label: "Notification Settings", icon: "bell" },
  { id: "m-out", label: "Sign Out", icon: "x" },
]);

const profileBody = (extra: MockEl[] = []): MockEl[] => [
  card("pic", "Profile Picture", [
    { k: "avatar", id: "avatar-photo", initials: "AO", label: "Defaults to your initials until you upload a photo (max 2 MB)." },
  ]),
  card("info", "Personal Information", [
    row([field("first", "First Name", "Amara"), field("last", "Last Name", "Okafor")]),
    field("phone", "Phone", undefined, "Optional"),
    area("bio", "Bio", undefined, "Tell us a little about yourself..."),
    row([btn("save", "Save Changes")], "end"),
  ]),
  ...extra,
];

export const everyoneGuides: Guide[] = [
  {
    slug: "profile-photo-and-details",
    title: "Update your photo, name and phone",
    summary: "Open My Profile to add a photo, fix your name or add a phone number.",
    roles: ALL,
    category: "account",
    format: "animated",
    path: "/profile",
    where: "Your avatar (top right) → My Profile",
    keywords: ["profile", "avatar", "picture", "photo", "phone", "bio", "name"],
    screens: {
      dash: screen("student", "Overview", "Welcome back, Amara", [
        card("x", "My Courses", [list("l", [{ title: "Algebra II", meta: "Daniel Reyes" }])]),
      ], { actions: [accountMenu] }),
      profile: screen("student", undefined, "My Profile", profileBody(), { subtitle: "Manage your personal information and profile picture.", actions: [toast("saved", "Profile updated")] }),
    },
    steps: [
      { title: "Open your account menu", text: "Tap your initials or photo at the top right.", target: "avatar" },
      { title: "Choose My Profile", text: "Pick My Profile from the menu.", target: "m-profile", set: { acct: { open: true } } },
      { title: "Add a photo", text: "Tap the picture (or the little camera) and choose an image. It uploads straight away.", screen: "profile", target: "avatar-photo", set: { acct: { open: false }, "avatar-photo": { photo: true } }, tip: "Square photos up to 2 MB look best." },
      { title: "Add your phone", text: "Type your phone number. It's optional, and only staff who are allowed can see it.", target: "phone", set: { phone: { value: "+1 555 010 2030" } } },
      { title: "Save", text: "Tap Save Changes. That's it!", target: "save", set: { saved: { open: true } } },
    ],
    related: ["change-email", "change-password"],
  },
  {
    slug: "change-email",
    title: "Change your email address",
    summary: "Move your account to a new email. You confirm it from the new inbox.",
    roles: ALL,
    category: "account",
    format: "animated",
    path: "/profile",
    where: "My Profile → Change Email",
    keywords: ["email", "change email", "new email", "address"],
    screens: {
      profile: screen("student", undefined, "My Profile", [
        card("info", "Personal Information", [
          row([field("email", "Email", "amara@oldmail.com"), small("chg", "Change Email", "outline", "mail")], "between"),
        ]),
        dialog("dlg", "Change Email", [
          text("Change to"),
          field("newmail", "New email", undefined, "name@example.com"),
          row([btn("cancel", "Cancel", "outline"), btn("send", "Change Email")], "end"),
        ]),
        toast("sent", "Check your new inbox to confirm"),
      ]),
    },
    steps: [
      { title: "Go to My Profile", text: "Open your account menu (top right) and choose My Profile.", target: "info" },
      { title: "Tap Change Email", text: "Next to your email, tap Change Email.", target: "chg" },
      { title: "Type the new address", text: "Enter the email you want to use from now on.", target: "newmail", set: { dlg: { open: true }, newmail: { value: "amara@newmail.com" } } },
      { title: "Confirm", text: "Tap Change Email. Then open the confirmation link we send to the new address. Until then, keep using the old one to sign in.", target: "send", set: { sent: { open: true } } },
    ],
    troubleshoot: [{ problem: "The confirmation email never came", fix: "Check spam, and make sure the new address is typed correctly. You can try again from My Profile." }],
    related: ["change-password"],
  },
  {
    slug: "change-password",
    title: "Change your password",
    summary: "Pick a new password from My Profile.",
    roles: ALL,
    category: "account",
    format: "animated",
    path: "/profile",
    where: "My Profile → Change Password",
    keywords: ["password", "security", "change password"],
    screens: {
      profile: screen("student", undefined, "My Profile", [
        card("info", "Personal Information", [field("email", "Email", "amara@westbrook.edu"), row([small("chg", "Change Password", "outline", "lock")])]),
        dialog("dlg", "Change Password", [
          text("Use at least 8 characters."),
          { k: "field", id: "cur", label: "Current password", type: "password" },
          { k: "field", id: "np", label: "New password", type: "password" },
          { k: "field", id: "cp", label: "Confirm new password", type: "password" },
          row([btn("cancel", "Cancel", "outline"), btn("save", "Change Password")], "end"),
        ]),
        toast("ok", "Password changed"),
      ]),
    },
    steps: [
      { title: "Open Change Password", text: "In My Profile, tap Change Password.", target: "chg" },
      { title: "Current password", text: "Type the password you use now.", target: "cur", set: { dlg: { open: true }, cur: { value: "oldpass12" } } },
      { title: "New password", text: "Choose a new one with at least 8 characters, then type it again to confirm.", target: "np", set: { np: { value: "Blue-river-7" }, cp: { value: "Blue-river-7" } } },
      { title: "Save", text: "Tap Change Password. You stay signed in on this device.", target: "save", set: { ok: { open: true } } },
    ],
    troubleshoot: [{ problem: "I don't remember my current password", fix: "Sign out and use Forgot password? on the sign-in page instead." }],
    related: ["sign-in-and-reset-password"],
  },
  {
    slug: "notification-settings",
    title: "Choose which notifications you get",
    summary: "Turn email or in-app notifications on or off, topic by topic.",
    roles: ALL,
    category: "account",
    format: "animated",
    path: "/settings/notifications",
    where: "Your avatar → Notification Settings",
    keywords: ["notifications", "email", "alerts", "mute", "preferences"],
    screens: {
      prefs: screen("student", undefined, "Notification Preferences", [
        card("delivery", "Delivery", [
          text("Choose how you want to receive notifications."),
          toggle("inapp", "In-App Notifications", true, "Receive notifications inside the app."),
          toggle("emailn", "Email Notifications", true, "Receive notifications via email."),
        ]),
        card("about", "Notify Me About", [
          toggle("t-chat", "Chat Messages", true),
          toggle("t-forum", "Forum Activity", true),
          toggle("t-asg", "Assignments", true),
          toggle("t-grades", "Grades", true),
        ]),
        toast("saved", "Saved"),
      ], { actions: [accountMenu] }),
    },
    steps: [
      { title: "Open the menu", text: "Tap your avatar at the top right.", target: "avatar" },
      { title: "Notification Settings", text: "Choose Notification Settings.", target: "m-notif", set: { acct: { open: true } } },
      { title: "Pick how", text: "Switch Email Notifications off if you only want alerts inside the app.", target: "emailn", set: { acct: { open: false }, emailn: { on: false } } },
      { title: "Pick what", text: "Turn individual topics on or off. For example, mute Forum Activity.", target: "t-forum", set: { "t-forum": { on: false }, saved: { open: true } }, tip: "Changes save automatically." },
    ],
    related: ["notifications-inbox"],
  },
  {
    slug: "notifications-inbox",
    title: "See and clear your notifications",
    summary: "The bell shows what's new. The Notifications page lists everything.",
    roles: ALL,
    category: "account",
    format: "steps",
    path: "/notifications",
    where: "Bell icon (top bar)",
    keywords: ["bell", "unread", "mark read", "alerts"],
    steps: [
      { title: "Tap the bell", text: "A gold dot means something new. Tap the bell to see your latest notifications." },
      { title: "Open one", text: "Tap a notification to jump to the assignment, message or post it's about." },
      { title: "See everything", text: "Open the Notifications page for the full list." },
      { title: "Mark all read", text: "Tap Mark all read to clear the dot.", tip: "Too many? Go to Notification Settings and switch off the topics you don't need." },
    ],
    related: ["notification-settings"],
  },
  {
    slug: "chat",
    title: "Chat with your class and teachers",
    summary: "Send messages in course channels or one-to-one, and start video calls.",
    roles: NO_PARENT,
    category: "communication",
    format: "animated",
    path: "/chat",
    where: "Sidebar → Chat",
    keywords: ["chat", "channel", "direct message", "dm", "video call", "emoji", "attachment"],
    screens: {
      chat: screen("student", "Chat", "Chat", [
        row([
          card("chans", "Channels", [list("cl", [
            { id: "ch-alg", title: "# algebra-ii", meta: "Course channel" },
            { id: "ch-dm", title: "Daniel Reyes", meta: "Direct Message" },
          ])]),
        ]),
        chat("thread", [
          { from: "Daniel Reyes", text: "Quiz moved to Friday!" },
          { from: "Kofi", text: "Thanks for the heads up 🙏" },
        ]),
        row([field("msg", "Message", undefined, "Type a message…"), btn("send", "Send", "primary", "send")], "between"),
      ]),
    },
    steps: [
      { title: "Open Chat", text: "Tap Chat in the sidebar (on phones, open the menu first).", target: "nav:Chat" },
      { title: "Pick a channel", text: "Every course has its own channel. Direct Messages are just between two people.", target: "ch-alg" },
      { title: "Write your message", text: "Type in the box at the bottom. Press Enter to send, or Shift+Enter for a new line.", target: "msg", set: { msg: { value: "See you all Friday!" } } },
      { title: "Send", text: "Tap Send. You can also react with emoji, attach a file, or reply in a thread.", target: "send", set: { thread: { messages: [
        { from: "Daniel Reyes", text: "Quiz moved to Friday!" },
        { from: "Kofi", text: "Thanks for the heads up 🙏" },
        { from: "You", text: "See you all Friday!", me: true },
      ] }, msg: { value: "" } }, tip: "Need to talk face to face? Use Video Call at the top of a conversation." },
    ],
    related: ["messages", "forum"],
  },
  {
    slug: "messages",
    title: "Send a private message",
    summary: "Messages works like email inside SolomonQuest: Inbox, Sent and Compose.",
    roles: ALL,
    category: "communication",
    format: "animated",
    path: "/messages",
    where: "Messages",
    keywords: ["inbox", "compose", "mail", "reply", "message"],
    screens: {
      inbox: screen("student", undefined, "Messages", [
        row([tabs("box", ["Inbox", "Sent"]), btn("compose", "Compose", "primary", "edit")], "between"),
        list("mails", [
          { id: "m1", title: "Question about homework", meta: "Daniel Reyes · yesterday" },
          { id: "m2", title: "Field trip form", meta: "School office · Mon" },
        ]),
        dialog("dlg", "Compose", [
          field("to", "To", undefined, "Search by name or email..."),
          field("subj", "Subject"),
          area("body", "Message", undefined, "Write your message..."),
          row([btn("cancel", "Cancel", "outline"), btn("send", "Send", "primary", "send")], "end"),
        ]),
        toast("sent", "Message sent"),
      ]),
    },
    steps: [
      { title: "Compose", text: "Open Messages and tap Compose.", target: "compose" },
      { title: "Choose who", text: "Start typing a name or email and pick the person.", target: "to", set: { dlg: { open: true }, to: { value: "Daniel Reyes" } } },
      { title: "Subject and message", text: "Give it a short subject and write your message.", target: "body", set: { subj: { value: "Extra help" }, body: { value: "Could we meet after class?" } } },
      { title: "Send", text: "Tap Send. Replies arrive in your Inbox, and the bell lets you know.", target: "send", set: { dlg: { open: false }, sent: { open: true } } },
    ],
    related: ["chat"],
  },
  {
    slug: "forum",
    title: "Start or join a forum discussion",
    summary: "Ask questions and share ideas with your school, class or program.",
    roles: NO_PARENT,
    category: "communication",
    format: "animated",
    path: "/forum",
    where: "Sidebar → Forum",
    keywords: ["forum", "topic", "discussion", "post", "comment", "question"],
    screens: {
      forum: screen("student", "Forum", "School Forum", [
        row([field("s", "Search", undefined, "Search topics…"), btn("new", "New Topic", "primary", "plus")], "between"),
        list("topics", [
          { title: "Study group for finals?", meta: "School-wide · 6 replies", badge: "Pinned", tone: "gold" },
          { title: "Week 3 reading questions", meta: "World History · 2 replies" },
        ]),
        dialog("dlg", "New Discussion Topic", [
          select("vis", "Visibility", "School-wide"),
          field("title", "Title", undefined, "What's on your mind?"),
          area("content", "Content"),
          row([btn("cancel", "Cancel", "outline"), btn("post", "Create Topic")], "end"),
        ]),
        toast("ok", "Topic posted"),
      ]),
    },
    steps: [
      { title: "Open Forum", text: "Tap Forum in the sidebar.", target: "nav:Forum" },
      { title: "New Topic", text: "Tap New Topic to start a discussion.", target: "new" },
      { title: "Who can see it", text: "Pick School-wide, a specific class, or a program. Class topics are only visible to that class.", target: "vis", set: { dlg: { open: true }, vis: { value: "Algebra II" } } },
      { title: "Write it", text: "Add a clear title and your question or idea.", target: "title", set: { title: { value: "Tips for factoring?" }, content: { value: "Any tricks for quadratics?" } } },
      { title: "Post", text: "Tap Create Topic. People can reply, react and @mention each other.", target: "post", set: { dlg: { open: false }, ok: { open: true } } },
    ],
    related: ["chat"],
  },
  {
    slug: "calendar",
    title: "Use your calendar",
    summary: "Due dates, live classes and reminders in one place.",
    roles: NO_PARENT,
    category: "communication",
    format: "animated",
    path: "/calendar",
    where: "Sidebar → Calendar",
    keywords: ["calendar", "schedule", "due date", "deadline", "live session", "reminder"],
    screens: {
      cal: screen("student", "Calendar", "Calendar", [
        text("Assignment due dates, live sessions, and reminders in one place."),
        row([{ k: "badge", id: "lg1", label: "Assignment due", tone: "warning" }, { k: "badge", id: "lg2", label: "Live session", tone: "primary" }, { k: "badge", id: "lg3", label: "Reminder", tone: "gold" }]),
        { k: "calendar", id: "cal", month: "November", events: [
          { day: 4, label: "Essay due", tone: "warning" },
          { day: 12, label: "Live: Algebra", tone: "primary" },
          { day: 18, label: "Quiz Fri", tone: "gold" },
          { day: 25, label: "Problem set", tone: "warning" },
        ] },
      ]),
    },
    steps: [
      { title: "Open Calendar", text: "Tap Calendar in the sidebar.", target: "nav:Calendar" },
      { title: "Read the colours", text: "Each colour is a kind of event: assignment due dates, live sessions and reminders.", target: "lg1" },
      { title: "Tap an event", text: "Tap any event to jump straight to it, for example the live class to join.", target: "cal:12" },
    ],
    related: ["student-live-class-checkin"],
  },
  {
    slug: "ai-assistant",
    title: "Ask the AI assistant",
    summary: "The assistant answers questions about the platform and can help you find things.",
    roles: NO_PARENT,
    category: "communication",
    format: "steps",
    keywords: ["ai", "assistant", "solomon", "sol", "chatbot", "help"],
    steps: [
      { title: "Open the assistant", text: "Tap the round navy assistant button at the bottom right of your dashboard." },
      { title: "Ask in plain words", text: "For example: \"What's due this week?\" or \"How do I export grades?\"" },
      { title: "Confirm actions", text: "If the assistant offers to do something for you, it always asks you to confirm first." },
      { title: "Step-by-step help", text: "For a full walkthrough, this Help Center is usually quicker. If you send lots of messages in a short time, the assistant will point you here.", tip: "Your school admin can rename the assistant under Settings → AI Assistant." },
    ],
  },
  {
    slug: "notes",
    title: "Keep notes and sticky notes",
    summary: "Jot things down and share notes with colleagues.",
    roles: ["teacher", "admin", "staff", "student", "super_admin"],
    category: "communication",
    format: "steps",
    keywords: ["notes", "sticky", "share note"],
    steps: [
      { title: "Open Notes", text: "Tap the round gold Notes button at the bottom right of your dashboard." },
      { title: "New note", text: "Tap New, give it a title and write. Notes save as you type." },
      { title: "Pin it", text: "Make it a sticky note to keep it on screen while you work." },
      { title: "Share", text: "Use Share to give a colleague access. They'll see it in their own Notes." },
    ],
  },
  {
    slug: "replay-the-tour",
    title: "Replay the guided tour",
    summary: "Run the short welcome tour of your dashboard again.",
    roles: ALL,
    category: "start",
    format: "steps",
    keywords: ["tour", "walkthrough", "onboarding", "welcome"],
    steps: [
      { title: "Open the Help Center", text: "You're here! Scroll to the top of the Help Center home." },
      { title: "Take the guided tour", text: "Tap Take the guided tour. You go back to your dashboard and the tour starts." },
      { title: "Skip or step through", text: "Use Next and Back, or close it at any time. You can always run it again from here." },
    ],
  },
];
