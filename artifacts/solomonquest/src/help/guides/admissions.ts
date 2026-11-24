import type { Audience, Guide } from "../types";
import { area, badge, btn, card, dialog, field, list, row, screen, select, small, table, tabs, text, toast, toggle } from "../mock";

// Program pricing, the optional application fee and the admission
// (congratulations) email. School admins + super admins, and applicants.
const AS: Audience[] = ["admin", "super_admin"];

export const admissionsGuides: Guide[] = [
  {
    slug: "admin-program-prices",
    title: "Set program prices",
    summary: "Give each program a price, or mark it Free. It shows on your school page and the application form.",
    roles: AS,
    category: "finance",
    format: "animated",
    path: "/dashboard/admin/programs",
    where: "Sidebar → Programs → Price column",
    keywords: ["price", "program price", "tuition", "fees", "free", "installments", "currency", "pricing note", "cost"],
    screens: {
      p: screen("admin", "Programs", "Programs", [
        row([field("s", "Search", undefined, "Search programs..."), btn("new", "Create Program", "primary", "plus")], "between"),
        table("tbl", ["Program", "Courses", "Price", "Status"], [
          ["Nursing Diploma", "6", "Free", "Active"],
          ["Bible School", "4", "Free", "Active"],
        ]),
        dialog("d", "Price · Nursing Diploma", [
          row([small("free", "Free", "outline"), small("paid", "Paid", "outline")]),
          row([field("amt", "Price", undefined, "0.00"), select("cur", "Currency", "USD")]),
          field("note", "Pricing note (optional)", undefined, "e.g. Includes books and lab materials"),
          toggle("full", "Allow full payment", true, "Pay the whole price at once"),
          toggle("inst", "Allow installments", false, "Split it into monthly payments"),
          field("n", "Number of installments"),
          row([btn("save", "Save price")], "end"),
        ]),
        toast("ok", "Price saved"),
      ]),
    },
    steps: [
      { title: "Open Programs", text: "Tap Programs in the sidebar. Every program shows its price, or Free.", target: "nav:Programs" },
      { title: "Click the price", text: "Tap the price in a program's row (or open the program and scroll to Price).", target: "tbl:0:2" },
      { title: "Choose Paid", text: "Free is the default. Choose Paid to set a price.", target: "paid", set: { d: { open: true }, paid: { variant: "primary" } } },
      { title: "Amount and currency", text: "Type the price and pick the currency.", target: "amt", set: { amt: { value: "4500.00" } } },
      { title: "Add a short note", text: "Optional, e.g. what the price includes. Applicants see it next to the price.", target: "note", set: { note: { value: "Includes uniforms and lab materials" } } },
      { title: "Installments", text: "Allow full payment, installments or both, and choose how many payments.", target: "inst", set: { inst: { on: true }, n: { value: "3" } } },
      { title: "Save", text: "Tap Save price. When you approve an applicant to this program, it appears on their Tuition page.", target: "save", set: { d: { open: false }, ok: { open: true }, tbl: { rows: [["Nursing Diploma", "6", "$4,500.00", "Active"], ["Bible School", "4", "Free", "Active"]] } }, tip: "To make a program free again, open its price and choose Free. Past payments are kept." },
    ],
    troubleshoot: [
      { problem: "Saving says the feature is turned off", fix: "Tuition is switched off for your school. Ask the platform administrator to turn it on." },
    ],
    related: ["admin-application-fee", "admin-tuition-plans", "admin-programs"],
  },
  {
    slug: "admin-application-fee",
    title: "Charge an application fee",
    summary: "Applying is free by default. Turn on a fee and applicants pay online, to your school's Stripe account.",
    roles: AS,
    category: "academics",
    format: "animated",
    path: "/dashboard/admin/admissions/settings",
    where: "Admissions → Admission settings → Application fee",
    keywords: ["application fee", "admission fee", "paid application", "free application", "waive", "stripe", "refund"],
    screens: {
      f: screen("admin", "Admissions", "Admission settings", [
        tabs("t", ["Admission details", "Application fee", "Programs"], 1),
        card("stripe", "Connect Stripe to charge an application fee", [text("Your school hasn't connected a Stripe account yet."), small("connect", "Connect Stripe", "outline")], undefined, "warning"),
        toggle("on", "Charge an application fee", false, "Off: applying is free"),
        row([field("amt", "Fee amount", undefined, "50.00"), select("cur", "Currency", "USD")]),
        row([btn("save", "Save fee")], "end"),
        text("Refunds aren't handled here: issue them from your Stripe dashboard."),
        toast("ok", "Application fee is on"),
      ]),
      a: screen("admin", "Admissions", "Admissions", [
        table("tbl", ["Applicant", "Program", "Status", "Fee"], [
          ["Amara Okafor", "Nursing Diploma", "Received", "Awaiting payment · $50.00"],
          ["Kofi Mensah", "Bible School", "Under Review", "Fee paid · $50.00"],
        ]),
        dialog("w", "Application fee · Amara Okafor", [
          text("Not paid yet. You can't approve until it's paid, unless you waive it."),
          area("why", "Reason for waiving (optional, internal)", undefined, "e.g. Scholarship applicant"),
          row([btn("waive", "Waive fee & approve")], "end"),
        ]),
        toast("done", "Approved. The congratulations email is on its way."),
      ]),
    },
    steps: [
      { title: "Open Admission settings", text: "In Admissions, tap Admission settings, then the Application fee tab.", target: "t:1" },
      { title: "Connect Stripe first", text: "A fee goes straight to your school's own Stripe account, so Stripe must be connected and able to take card payments.", target: "connect" },
      { title: "Turn it on", text: "Once Stripe is ready, switch on Charge an application fee.", target: "on", set: { stripe: { tone: "success", title: "Stripe is connected", children: [] }, on: { on: true, hint: "On: applicants pay to apply" } } },
      { title: "Set the amount", text: "Enter the fee and currency, then tap Save fee. Programs can have their own fee, or be free, on the Programs tab.", target: "amt", set: { amt: { value: "50.00" }, ok: { open: true } } },
      { title: "Unpaid applications", text: "In Admissions, the Fee column shows Awaiting payment until the applicant pays.", screen: "a", target: "tbl:0:3" },
      { title: "Waive it if you need to", text: "Open an application to waive its fee. Waiving is recorded with your name and the time.", target: "waive", set: { w: { open: true }, why: { value: "Scholarship applicant" } } },
      { title: "Approve", text: "Approve once the fee is paid or waived.", target: "waive", set: { w: { open: false }, done: { open: true } }, tip: "Paid application fees show in Accounting as their own revenue category." },
    ],
    troubleshoot: [
      { problem: "The switch is greyed out", fix: "Connect Stripe on the Tuition page and finish Stripe's setup until it can take card payments." },
      { problem: "An applicant wants a refund", fix: "Refund the payment from your Stripe dashboard. SolomonQuest doesn't issue refunds." },
    ],
    related: ["admin-stripe-connect", "admin-admission-email", "applicant-pay-application-fee", "admin-accounting"],
  },
  {
    slug: "admin-admission-email",
    title: "Customise the admission email",
    summary: "Write the congratulations email students get when you approve them, with your own next steps.",
    roles: AS,
    category: "academics",
    format: "animated",
    path: "/dashboard/admin/admissions/settings",
    where: "Admissions → Admission settings → Admission details",
    keywords: ["admission email", "acceptance letter", "congratulations", "offer letter", "next steps", "orientation", "approval email", "welcome email"],
    screens: {
      e: screen("admin", "Admissions", "Admission settings", [
        tabs("t", ["Admission details", "Application fee", "Programs"], 0),
        card("msg", "Congratulations message", [
          field("head", "Headline", "Congratulations, {studentName}!"),
          area("body", "Message", "We are delighted to let you know that your application to {schoolName} has been approved."),
          row([badge("p1", "{studentName}", "muted"), badge("p2", "{programName}", "muted"), badge("p3", "{schoolName}", "muted"), badge("p4", "{startDate}", "muted")]),
          field("date", "Program start / orientation date", undefined, "dd/mm/yyyy"),
        ]),
        card("steps", "Next steps", [
          list("sl", [{ title: "1. Sign in to your student dashboard" }, { title: "2. Complete your profile" }]),
          small("add", "Add step", "outline", "plus"),
        ]),
        row([btn("save", "Save admission details"), small("test", "Send test to me", "outline", "send")]),
        toast("ok", "Test email sent to you"),
      ]),
    },
    steps: [
      { title: "Open Admission details", text: "In Admissions, tap Admission settings. It opens on Admission details.", target: "t:0" },
      { title: "Write your headline", text: "It already has friendly default text, so it works even if you never edit it.", target: "head", set: { head: { value: "Welcome to the family, {studentName}!" } } },
      { title: "Use placeholders", text: "Tap a placeholder to insert it. {programName}, {schoolName} and {startDate} are filled in for each student.", target: "p2" },
      { title: "Set the start date", text: "Add your program start or orientation date.", target: "date", set: { date: { value: "11/01/2027" } } },
      { title: "List the next steps", text: "Add steps in order, each with a title, a description and an optional link. Add required documents, a contact person and extra links below.", target: "add", set: { sl: { items: [{ title: "1. Sign in to your student dashboard" }, { title: "2. Complete your profile" }, { title: "3. Bring your documents to orientation" }] } } },
      { title: "Preview and test", text: "The live preview shows the exact email. Tap Send test to me to see it in your inbox.", target: "test", set: { ok: { open: true } } },
      { title: "Save", text: "Tap Save admission details. Each approval now sends this email, with the tuition and a View tuition link for priced programs.", target: "save", tip: "Programs can override the message and next steps on the Programs tab." },
    ],
    troubleshoot: [
      { problem: "Approved, but the email could not be sent", fix: "The approval still went through. Open the application in Admissions and tap Resend congratulations email." },
      { problem: "My link was rejected", fix: "Links must be full web addresses starting with http:// or https://." },
    ],
    related: ["admin-admissions", "admin-application-fee", "admin-program-prices"],
  },
  {
    slug: "applicant-pay-application-fee",
    title: "Paying an application fee",
    summary: "Some schools charge a fee to apply. You pay online by card after you submit, or later.",
    roles: ["visitor", "student"],
    category: "payments",
    format: "animated",
    where: "Apply page → Review & Submit, and your application page",
    keywords: ["application fee", "pay to apply", "admission fee", "pay now", "stripe", "card"],
    screens: {
      r: screen("public", undefined, "Review Your Application", [
        tabs("wiz", ["Choose Courses", "Application Form", "Review & Submit"], 2),
        card("prog", "Program", [row([text("Nursing Diploma", false), text("Tuition: $4,500.00", false)], "between")]),
        card("fee", "Application fee", [row([text("Due now", false), text("$50.00", false)], "between"), text("After you submit, you'll pay securely with Stripe.")], undefined, "warning"),
        row([btn("submit", "Submit & pay $50.00", "gold")], "end"),
      ]),
      s: screen("public", undefined, "Your application to Westbrook Academy", [
        card("status", "Application status", [badge("st", "Submitted", "primary")]),
        card("feecard", "Application fee", [row([text("$50.00", false), badge("fs", "Awaiting payment", "warning")], "between"), btn("pay", "Pay now", "primary", "card")]),
        toast("paid", "Payment received. Thank you!"),
      ]),
    },
    steps: [
      { title: "See the fee first", text: "If the school charges a fee, it's shown on the first step and again on Review & Submit, before you pay anything.", target: "fee" },
      { title: "Check the program price", text: "The program's tuition is shown too. Tuition is paid later, after you're accepted.", target: "prog" },
      { title: "Submit and pay", text: "Tap Submit & pay. Your application is saved, then you're taken to Stripe to pay by card.", target: "submit" },
      { title: "Your application page", text: "After paying you come back to your application page. It shows Paid once the payment goes through.", screen: "s", target: "fs", set: { fs: { label: "Paid", tone: "success" }, paid: { open: true } } },
      { title: "Pay later", text: "Closed the payment page? Open your application again and tap Pay now. The school reviews it once the fee is paid.", target: "pay", set: { fs: { label: "Awaiting payment", tone: "warning" }, paid: { open: false } } },
    ],
    troubleshoot: [
      { problem: "Payment says the school can't take online payments", fix: "Contact the school. They may waive the fee or fix their payment setup." },
      { problem: "I was charged but it still says Awaiting payment", fix: "Refresh after a minute. If it doesn't change, contact the school with your payment receipt." },
      { problem: "I need a refund", fix: "Refunds are handled by the school. Contact them directly." },
    ],
    related: ["apply-to-a-school", "student-pay-tuition"],
  },
];
