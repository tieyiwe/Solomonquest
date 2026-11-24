import type { Audience, Guide, MockEl } from "../types";
import { area, badge, btn, card, check, dialog, field, list, row, screen, select, small, stats, table, tabs, text, toast } from "../mock";

/**
 * Tuition ledger guides: recording payments, receipts, balance reminders,
 * payment instructions (admins) and "Your balance and receipts" (students
 * and parents). Mirrors Accounting → Student Balances / Payment settings,
 * the receipt page, and the student/parent Tuition pages.
 */

const AS: Audience[] = ["admin", "super_admin"];
const accTabs = (active: number): MockEl => tabs("acctabs", ["Overview (P&L)", "Student Balances", "Expenses", "Payment settings"], active);

const balancesTable = (highlight?: number): MockEl => ({
  k: "table",
  id: "bt",
  cols: ["", "Student", "Status", "Billed", "Paid", "Outstanding", "Next due", "Reminded", "Actions"],
  rows: [
    ["☐", "Amara Okafor", "Overdue", "$675", "$225", "$450", "1 Dec", "Never", "Payment"],
    ["☐", "Lena Park", "Partially paid", "$900", "$300", "$600", "15 Dec", "3d ago", "Payment"],
    ["☐", "Kofi Mensah", "Paid in full", "$1,000", "$1,000", "$0", "—", "—", "Payment"],
  ],
  highlightRow: highlight,
});

export const accountingGuides: Guide[] = [
  {
    slug: "admin-record-payment",
    title: "Record a payment",
    summary: "Record cash, bank transfer, cheque or mobile money against a student's balance, or apply a discount or waiver.",
    roles: AS,
    category: "finance",
    format: "animated",
    path: "/dashboard/admin/accounting",
    where: "Accounting → Student Balances → Payment",
    keywords: ["record payment", "cash", "bank transfer", "cheque", "check", "mobile money", "mark paid", "partial payment", "overpayment", "credit", "discount", "scholarship", "waiver", "refund", "void", "ledger"],
    screens: {
      bal: screen("admin", "Accounting", "Accounting", [
        accTabs(1),
        stats([{ label: "Outstanding", value: "$1,050", tone: "danger" }, { label: "Overdue", value: "$225", tone: "danger" }, { label: "Owing / overdue", value: "2 / 1" }], "kp"),
        balancesTable(0),
        dialog("d", "Record a payment · Amara Okafor", [
          stats([{ label: "Outstanding now", value: "$450.00" }, { label: "After this", value: "$225.00" }], "rp-stats"),
          row([select("type", "Type", "Payment received"), field("amt", "Amount (USD)", undefined, "0.00")]),
          row([field("date", "Date received", "24 Nov 2026"), select("method", "Method", "Cash")]),
          field("ref", "Reference number (optional)", undefined, "Bank ref, cheque no., M-Pesa code…"),
          select("apply", "Apply to", "Oldest due first (recommended)"),
          row([btn("cancel", "Cancel", "outline"), btn("save", "Record payment")], "end"),
        ]),
        toast("ok", "Payment recorded: $225.00 · View receipt"),
      ]),
      ledger: screen("admin", "Accounting", "Amara Okafor", [
        stats([{ label: "Billed", value: "$675" }, { label: "Paid", value: "$450", tone: "success" }, { label: "Discounts", value: "$0" }, { label: "Outstanding", value: "$225", tone: "danger" }], "lst"),
        row([small("rec", "Record payment", "primary", "plus"), small("disc", "Discount / waiver"), small("refund", "Refund")]),
        card("led", "Ledger", [
          list("entries", [
            { id: "e1", title: "Payment · Cash", meta: "24 Nov 2026 · R-20261124-7F3A21C0", badge: "−$225.00", tone: "success" },
            { id: "e2", title: "Payment · Bank transfer", meta: "2 Oct 2026 · Ref FBN-88172", badge: "−$225.00", tone: "success" },
          ]),
          row([small("rcpt", "Receipt", "ghost", "file"), small("void", "Void", "danger")]),
        ]),
        dialog("vd", "Void this entry?", [
          text("It stays in the ledger, marked void, and no longer counts towards the balance."),
          area("reason", "Reason", undefined, "e.g. Entered twice by mistake"),
          row([btn("vc", "Cancel", "outline"), btn("vok", "Void entry", "danger")], "end"),
        ]),
      ]),
    },
    steps: [
      { title: "Open Student Balances", text: "In Accounting, open the Student Balances tab. Every student with tuition is listed with what they owe.", target: "acctabs" },
      { title: "Tap Payment", text: "On the student's row (or card, on a phone), tap Payment.", target: "bt:0:8", set: { d: { open: true } } },
      { title: "Amount and date", text: "Enter the amount and the day you received it. A partial payment is fine.", target: "amt", set: { amt: { value: "225.00" } } },
      { title: "Method and reference", text: "Choose Cash, Bank transfer, Cheque, Mobile money, Card (in person) or Other, and add the reference number if there is one.", target: "method", set: { ref: { value: "Receipt book #0412" } } },
      { title: "Where it goes", text: "By default it pays the oldest unpaid installment first. You can pick a plan or a specific installment instead.", target: "apply", tip: "Paying more than is owed? You'll be asked to lower it, or to keep the extra as credit for the next charge." },
      { title: "Save", text: "Tap Record payment. The balance updates straight away and a receipt is created.", target: "save", set: { d: { open: false }, ok: { open: true } } },
      { title: "The student's ledger", text: "Tap a student's name to see everything billed and every payment, discount and refund.", screen: "ledger", target: "entries" },
      { title: "Discounts, scholarships, waivers", text: "Use Discount / waiver to lower what's owed without recording money. Name it, e.g. \"Scholarship\".", target: "disc" },
      { title: "Fix a mistake", text: "Never delete: tap Void, give a reason, and the balance is recalculated. The voided entry stays visible.", target: "void", set: { vd: { open: true }, reason: { value: "Entered twice by mistake" } } },
    ],
    troubleshoot: [
      { problem: "\"This payment is more than the outstanding balance\"", fix: "Lower the amount, or tick Keep the extra as credit. Credit is used automatically for the next thing billed." },
      { problem: "Payments can't be recorded and there's a ledger warning", fix: "The database update for the ledger hasn't been applied yet. Ask your platform administrator to run tuition-ledger.sql." },
    ],
    related: ["admin-print-receipt", "admin-balance-reminders", "admin-accounting"],
  },
  {
    slug: "admin-balance-reminders",
    title: "Send balance reminders",
    summary: "Remind one student, a selection, or everyone who owes, with their exact balance, in one click.",
    roles: AS,
    category: "finance",
    format: "animated",
    path: "/dashboard/admin/accounting",
    where: "Accounting → Student Balances",
    keywords: ["remind", "reminder", "balance", "owing", "overdue", "fees due", "bulk", "email", "parents", "nudge", "chase"],
    screens: {
      bal: screen("admin", "Accounting", "Accounting", [
        accTabs(1),
        row([field("q", "Search", undefined, "Search by name or email"), select("st", "Status", "All statuses (3)"), select("sort", "Sort", "Balance: highest first"), small("more", "More filters", "outline", "filter")]),
        row([small("sel", "Remind selected (0)", "primary", "bell"), small("owing", "Remind all owing (2)"), small("over", "Remind all overdue (1)")], "start", "bulk"),
        balancesTable(),
        dialog("d", "Remind all owing (2)", [
          text("2 students will be reminded. 0 reminded in the last 24 hours will be skipped.", false, "count"),
          card("sample", "Sample, for Amara Okafor", [], "Hi Amara, your balance for Diploma in Ministry is $450.00 (2 installments). Next payment of $225.00 was due on 1 Dec 2026. • Installment 2 of 3: $225.00 • Installment 3 of 3: $225.00 · Total due: $450.00"),
          area("note", "Add a note (optional)", undefined, "e.g. The bursar's office is open until 4pm."),
          check("parents", "Also notify parents/guardians"),
          row([btn("c", "Cancel", "outline"), btn("send", "Send 2 reminders", "primary", "bell")], "end"),
        ]),
        dialog("done", "Reminders sent", [
          stats([{ label: "Reminded", value: "2", tone: "success" }, { label: "Emails sent", value: "2" }, { label: "Failed", value: "0" }], "sum"),
          text("1 skipped: reminded in the last 24 hours."),
          row([btn("ok", "Done")], "end"),
        ]),
      ]),
    },
    steps: [
      { title: "Filter first", text: "Narrow the list by status (Overdue, Owing, Partially paid, Paid in full), program, course, amount owed or a name.", target: "st", set: { st: { value: "Overdue (1)" } } },
      { title: "Pick who to remind", text: "Tick students and tap Remind selected, or use Remind all owing / Remind all overdue for everyone in the current list.", target: "owing", set: { st: { value: "All statuses (3)" }, d: { open: true } } },
      { title: "Check the message", text: "You see how many will be sent and a sample. Each student gets their own items, amounts and due dates.", target: "sample" },
      { title: "Add a note (optional)", text: "Your note is added to every message (up to 500 characters).", target: "note", set: { note: { value: "Office hours: Mon–Fri 9am–4pm." } } },
      { title: "Copy parents", text: "Tick Also notify parents/guardians to send each linked parent the same balance.", target: "parents", set: { parents: { on: true } } },
      { title: "Send", text: "Tap Send. Reminders go by email and as an in-app notification, and the summary shows what was sent, emailed and failed.", target: "send", set: { d: { open: false }, done: { open: true } }, tip: "Anyone reminded in the last 24 hours is skipped unless you tick the option to include them." },
    ],
    troubleshoot: [
      { problem: "Emails sent shows 0", fix: "Email isn't configured on the platform, or those students turned off tuition emails in Notification settings. In-app notifications still go out." },
      { problem: "Some students were skipped", fix: "They were reminded in the last 24 hours, or they owe nothing. Tick \"Include students reminded in the last 24 hours\" to send anyway." },
    ],
    related: ["admin-record-payment", "admin-payment-instructions"],
  },
  {
    slug: "admin-print-receipt",
    title: "Print or email a receipt",
    summary: "Every recorded payment gets a numbered, school-branded receipt you can print or email.",
    roles: AS,
    category: "finance",
    format: "animated",
    path: "/dashboard/admin/accounting",
    where: "Accounting → Student Balances → student → Ledger → Receipt",
    keywords: ["receipt", "print", "pdf", "email receipt", "proof of payment", "receipt number"],
    screens: {
      r: screen("public", undefined, "Payment receipt", [
        row([small("back", "Back", "ghost"), check("par", "Also email parents/guardians"), small("email", "Email receipt to student", "outline", "mail"), small("print", "Print", "primary", "print")], "end"),
        card("receipt", "Westbrook Academy · Receipt R-20261124-7F3A21C0", [
          stats([{ label: "Received from", value: "Amara Okafor" }, { label: "Amount", value: "$225.00", tone: "success" }], "who"),
          table("f", ["Date received", "Method", "Reference", "For"], [["24 Nov 2026", "Cash", "Receipt book #0412", "Diploma in Ministry"]]),
          stats([{ label: "Remaining balance", value: "$225.00", tone: "warning" }], "rem"),
        ]),
        toast("sent", "Receipt emailed (2)"),
      ]),
    },
    steps: [
      { title: "Open the receipt", text: "Right after recording a payment, tap View receipt in the confirmation. Later, open the student's ledger and tap Receipt.", target: "receipt" },
      { title: "What's on it", text: "Receipt number, student, amount, method, reference, date and the balance remaining at that moment.", target: "rem" },
      { title: "Print", text: "Tap Print, or save it as a PDF from the print dialog.", target: "print" },
      { title: "Email it", text: "Tap Email receipt to student. Tick Also email parents/guardians to copy them.", target: "email", set: { par: { on: true }, sent: { open: true } }, tip: "A voided payment's receipt is stamped VOID." },
    ],
    related: ["admin-record-payment", "student-balance-and-receipts"],
  },
  {
    slug: "admin-payment-instructions",
    title: "Set payment instructions",
    summary: "Tell families how to pay (bank details, mobile money, where to pay cash) while online payment isn't connected.",
    roles: AS,
    category: "finance",
    format: "animated",
    path: "/dashboard/admin/accounting",
    where: "Accounting → Payment settings",
    keywords: ["payment instructions", "bank details", "how to pay", "account number", "mobile money", "cash office", "no stripe"],
    screens: {
      s: screen("admin", "Accounting", "Accounting", [
        accTabs(3),
        card("pi", "Payment instructions", [
          text("Shown on each student's Tuition page and in balance reminders."),
          area("txt", "Payment instructions", undefined, "Bank transfer: …  Cash: …"),
          row([btn("save", "Save")], "end"),
        ]),
        toast("ok", "Payment instructions saved"),
      ]),
    },
    steps: [
      { title: "Open Payment settings", text: "In Accounting, open the Payment settings tab.", target: "acctabs" },
      { title: "Write the instructions", text: "Add bank details, mobile money numbers and where to pay cash. Ask families to use the student's name as the reference.", target: "txt", set: { txt: { value: "Bank transfer: First Bank, acct 0123456789 (Westbrook Academy). Reference: student's name.\nCash: bursar's office, Mon–Fri 9am–4pm." } } },
      { title: "Save", text: "Tap Save. Students see it on their Tuition page, and reminders include it with a View balance link.", target: "save", set: { ok: { open: true } }, tip: "Once online payment (Stripe) is connected, reminders link to View and pay instead." },
    ],
    related: ["admin-balance-reminders", "admin-stripe-connect"],
  },
  {
    slug: "student-balance-and-receipts",
    title: "Your balance and receipts",
    summary: "See what's billed, paid and still owed, when the next payment is due, how to pay, and every receipt.",
    roles: ["student", "staff", "parent"],
    category: "payments",
    format: "animated",
    path: "/dashboard/student/tuition",
    where: "Students: Sidebar → Tuition · Parents: Overview → Balance, payments and receipts",
    keywords: ["balance", "receipt", "how much do i owe", "fees", "tuition", "payment history", "due date", "overdue", "parent", "bank details"],
    screens: {
      t: screen("student", "Tuition", "Tuition", [
        stats([{ label: "Total billed", value: "$675" }, { label: "Paid", value: "$225", tone: "success" }, { label: "Discounts", value: "$0" }, { label: "Outstanding", value: "$450", tone: "danger" }], "bal"),
        row([badge("st", "Overdue", "danger"), text("Next payment: $225.00 was due 1 Dec 2026", false, "next")]),
        card("how", "How to pay Westbrook Academy", [], "Bank transfer: First Bank, acct 0123456789. Reference: your name. Cash: bursar's office, Mon–Fri 9am–4pm.", "primary"),
        card("hist", "Payment history", [
          list("pay", [{ id: "p1", title: "Payment · Bank transfer", meta: "2 Oct 2026 · R-20261002-1C9E04AA", badge: "$225.00 · Receipt", tone: "success" }]),
        ]),
      ]),
    },
    steps: [
      { title: "Open Tuition", text: "Students: tap Tuition in the sidebar. Parents: on your overview, tap Balance, payments and receipts under your child.", target: "nav:Tuition" },
      { title: "Your balance", text: "See the total billed, what's been paid, any discounts, and what's still outstanding.", target: "bal" },
      { title: "What's next", text: "The status shows Paid in full, Partially paid, Owing or Overdue, with the next amount and due date.", target: "next" },
      { title: "How to pay", text: "If your school takes payment outside the app, its instructions (bank details, where to pay cash) are shown here.", target: "how" },
      { title: "Receipts", text: "Every payment the school records appears in Payment history. Tap Receipt to view or print it.", target: "p1", tip: "Reminders from your school show the same numbers, item by item." },
    ],
    related: ["student-pay-tuition", "parent-dashboard"],
  },
];
