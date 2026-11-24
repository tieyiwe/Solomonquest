import { baseLayout, escapeHtml } from "./email";
import { formatDay, formatMoney, itemLineText, type ReminderContent } from "./tuitionLedgerCore";

/**
 * School-branded tuition emails: the balance reminder and the payment
 * receipt. Pure string builders (no sending) so they can be rendered and
 * checked in isolation. Every interpolated value is escaped.
 */

const PRIMARY = "#141d33";

export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.FRONTEND_URL ?? "https://app.solomonquest.com").replace(/\/+$/, "");
}

function p(html: string, style = ""): string {
  return `<p style="margin:0 0 12px;color:#444444;font-size:15px;line-height:1.6;${style}">${html}</p>`;
}

function textBlock(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

export interface SchoolBrand {
  name: string;
  logoUrl?: string | null;
}

export function reminderEmailHtml(input: {
  school: SchoolBrand;
  content: ReminderContent;
  today: string;
  note?: string;
  paymentInstructions?: string | null;
  onlinePayments: boolean;
  linkPath: string;
}): string {
  const { content, school } = input;
  const url = `${appUrl()}${input.linkPath}`;
  const rows = content.lines
    .map((l, idx) => {
      const planHtml =
        l.installmentCount > 1
          ? `${escapeHtml(l.planLabel)} &middot; installment ${l.installmentNumber} of ${l.installmentCount}`
          : escapeHtml(l.planLabel);
      const due = l.dueDate
        ? `<span style="color:${l.overdue ? "#b91c1c" : "#666666"};font-size:12px;">${l.overdue ? "Overdue &middot; was due" : "Due"} ${escapeHtml(formatDay(l.dueDate))}</span>`
        : "";
      return `<tr style="background:${idx % 2 ? "#ffffff" : "#f9f9f9"};">
        <td style="padding:10px 14px;color:#333333;font-size:13px;">${planHtml}<br/>${due}</td>
        <td style="padding:10px 14px;color:#333333;font-size:13px;text-align:right;white-space:nowrap;font-weight:bold;">${escapeHtml(formatMoney(l.remainingCents, l.currency))}</td>
      </tr>`;
    })
    .join("");
  const totalRows = content.totals
    .map(
      (t) => `<tr>
        <td style="padding:12px 14px;border-top:2px solid ${PRIMARY};color:${PRIMARY};font-size:14px;font-weight:bold;">Total due${content.totals.length > 1 ? ` (${escapeHtml(t.currency.toUpperCase())})` : ""}</td>
        <td style="padding:12px 14px;border-top:2px solid ${PRIMARY};color:${PRIMARY};font-size:15px;font-weight:bold;text-align:right;white-space:nowrap;">${escapeHtml(t.label)}</td>
      </tr>`
    )
    .join("");
  const note = input.note
    ? `<div style="margin:20px 0;padding:14px 16px;background:#f0f4ff;border-left:4px solid ${PRIMARY};border-radius:0 4px 4px 0;">
        <p style="margin:0 0 4px;color:#666666;font-size:12px;font-weight:bold;">A note from ${escapeHtml(school.name)}</p>
        <p style="margin:0;color:#444444;font-size:14px;line-height:1.5;">${textBlock(input.note)}</p>
      </div>`
    : "";
  const instructions =
    !input.onlinePayments && input.paymentInstructions?.trim()
      ? `<div style="margin:20px 0;padding:14px 16px;background:#fff8e1;border-left:4px solid #f59e0b;border-radius:0 4px 4px 0;">
          <p style="margin:0 0 4px;color:#666666;font-size:12px;font-weight:bold;">How to pay</p>
          <p style="margin:0;color:#444444;font-size:14px;line-height:1.5;">${textBlock(input.paymentInstructions)}</p>
        </div>`
      : "";
  const body = `
    <h1 style="margin:0 0 16px;color:${PRIMARY};font-size:22px;font-weight:bold;">Tuition balance reminder</h1>
    ${p(escapeHtml(content.summary))}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;border-collapse:separate;">
      ${rows}
      ${totalRows}
    </table>
    ${note}
    ${instructions}
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;background:${PRIMARY};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">${escapeHtml(content.linkLabel)}</a>
    </div>
    ${p(`<span style="color:#999999;font-size:12px;">If you've already paid, thank you, and please ignore this reminder; it can take a little while for a payment to show.</span>`)}
  `;
  return baseLayout(content.subject, body, { headerTitle: escapeHtml(school.name), headerLogoUrl: school.logoUrl ?? undefined });
}

/** Plain-text alternative, mirroring the HTML. */
export function reminderEmailText(content: ReminderContent, today: string, linkPath: string): string {
  const lines = [content.summary, "", "Outstanding:"];
  for (const l of content.lines) lines.push(`- ${itemLineText(l, today)}`);
  for (const t of content.totals) lines.push(`Total due: ${t.label}`);
  const rest = content.text.split("\n");
  const noteIdx = rest.findIndex((x) => x.startsWith("A note from ") || x === "How to pay:");
  if (noteIdx >= 0) lines.push("", ...rest.slice(noteIdx).filter((x) => !x.endsWith(content.linkPath)));
  lines.push("", `${content.linkLabel}: ${appUrl()}${linkPath}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export interface ReceiptView {
  receiptNumber: string | null;
  schoolName: string;
  studentName: string;
  studentEmail: string | null;
  kind: string;
  amountCents: number;
  currency: string;
  methodLabel: string | null;
  reference: string | null;
  paidOn: string;
  planLabel: string | null;
  appliedTo: { label: string; amountCents: number }[];
  remaining: { currency: string; outstandingCents: number; creditCents: number }[];
  recordedByName: string | null;
  voided: boolean;
  voidReason: string | null;
  note: string | null;
}

export function receiptEmailHtml(r: ReceiptView, school: SchoolBrand, viewPath: string): string {
  const title = `${r.kind === "refund" ? "Refund" : "Payment"} receipt ${r.receiptNumber ?? ""}`.trim();
  const row = (k: string, v: string, idx: number) =>
    `<tr style="background:${idx % 2 ? "#ffffff" : "#f9f9f9"};"><td style="padding:10px 14px;color:#666666;font-size:13px;font-weight:bold;width:42%;">${k}</td><td style="padding:10px 14px;color:#333333;font-size:13px;">${v}</td></tr>`;
  const remaining = r.remaining.length
    ? r.remaining
        .map((x) =>
          x.creditCents > 0
            ? `${escapeHtml(formatMoney(x.outstandingCents, x.currency))} (credit ${escapeHtml(formatMoney(x.creditCents, x.currency))})`
            : escapeHtml(formatMoney(x.outstandingCents, x.currency))
        )
        .join("<br/>")
    : escapeHtml(formatMoney(0, r.currency));
  const fields: [string, string][] = [
    ["Receipt number", escapeHtml(r.receiptNumber ?? "—")],
    ["Date received", escapeHtml(formatDay(r.paidOn))],
    ["Student", escapeHtml(r.studentName)],
    ["Amount", `<strong>${escapeHtml(formatMoney(r.amountCents, r.currency))}</strong>`],
    ["Method", escapeHtml(r.methodLabel ?? "—")],
  ];
  if (r.reference) fields.push(["Reference", escapeHtml(r.reference)]);
  if (r.planLabel) fields.push(["For", escapeHtml(r.planLabel)]);
  if (r.appliedTo.length) fields.push(["Applied to", r.appliedTo.map((a) => `${escapeHtml(a.label)}: ${escapeHtml(formatMoney(a.amountCents, r.currency))}`).join("<br/>")]);
  fields.push(["Remaining balance", remaining]);
  const body = `
    <h1 style="margin:0 0 16px;color:${PRIMARY};font-size:22px;font-weight:bold;">${r.kind === "refund" ? "Refund receipt" : "Payment receipt"}</h1>
    ${r.voided ? p(`<strong style="color:#b91c1c;">This receipt has been voided.</strong> ${escapeHtml(r.voidReason ?? "")}`) : ""}
    ${p(`Thank you. This confirms ${escapeHtml(school.name)} ${r.kind === "refund" ? "refunded" : "received"} the payment below.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      ${fields.map(([k, v], i) => row(k, v, i)).join("")}
    </table>
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${escapeHtml(`${appUrl()}${viewPath}`)}" style="display:inline-block;padding:14px 32px;background:${PRIMARY};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">View or print receipt</a>
    </div>
  `;
  return baseLayout(title, body, { headerTitle: escapeHtml(school.name), headerLogoUrl: school.logoUrl ?? undefined });
}
