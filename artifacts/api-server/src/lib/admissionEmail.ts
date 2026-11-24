import { baseLayout, escapeHtml } from "./email";
import {
  type AdmissionDetails,
  fillPlaceholders,
  formatMoney,
  formatStartDate,
  safeHttpUrl,
} from "./admissions";

/**
 * The school-branded "you've been admitted" email. Everything the school
 * typed is plain text: placeholders are filled first, then the result is
 * HTML-escaped. Links were already restricted to http(s) when saved and are
 * re-checked here.
 */

const PRIMARY = "#141d33";
const ACCENT = "#84602a";

export interface AdmissionEmailInput {
  details: AdmissionDetails;
  studentName: string;
  programName: string | null;
  school: { name: string; logoUrl?: string | null };
  /** Set when the approved program is priced. */
  tuition?: { amountCents: number; currency: string; installmentCount?: number; pricingNote?: string | null; url: string } | null;
  /** Where the student goes next: sign in, or set up their password. */
  account: { url: string; label: string; hint?: string };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br/>");
}

function p(html: string): string {
  return `<p style="margin:0 0 12px;color:#444444;font-size:15px;line-height:1.6;">${html}</p>`;
}

function sectionTitle(t: string): string {
  return `<p style="margin:28px 0 10px;color:${PRIMARY};font-size:16px;font-weight:bold;">${escapeHtml(t)}</p>`;
}

function cta(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 34px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">${escapeHtml(label)}</a>`;
}

export function renderAdmissionEmail(input: AdmissionEmailInput): RenderedEmail {
  const { details } = input;
  const startDate = formatStartDate(details.startDate);
  const vars = {
    studentName: input.studentName || "there",
    programName: input.programName || "your programme",
    schoolName: input.school.name,
    startDate: startDate || "your start date",
  };
  const fill = (t: string) => fillPlaceholders(t, vars);

  const headline = fill(details.headline);
  const message = fill(details.message);
  const subject = `Congratulations! You've been admitted to ${input.school.name}`.replace(/[\r\n]+/g, " ").slice(0, 200);

  const accountUrl = safeHttpUrl(input.account.url);
  const tuitionUrl = input.tuition ? safeHttpUrl(input.tuition.url) : null;

  const summaryRows: [string, string][] = [];
  if (input.programName) summaryRows.push(["Programme", input.programName]);
  if (startDate) summaryRows.push(["Start / orientation", startDate]);
  if (input.tuition) {
    const plan =
      input.tuition.installmentCount && input.tuition.installmentCount > 1
        ? ` (${input.tuition.installmentCount} installments)`
        : "";
    summaryRows.push(["Tuition", `${formatMoney(input.tuition.amountCents, input.tuition.currency)}${plan}`]);
  }
  const summary = summaryRows.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
        ${summaryRows
          .map(
            ([k, v], i) => `<tr${i % 2 === 0 ? ' style="background:#f9f9f9;"' : ""}>
          <td style="padding:12px 16px;color:#666666;font-size:13px;font-weight:bold;width:40%;">${escapeHtml(k)}</td>
          <td style="padding:12px 16px;color:#333333;font-size:13px;">${escapeHtml(v)}</td>
        </tr>`
          )
          .join("")}
      </table>`
    : "";

  const tuitionBlock =
    input.tuition && tuitionUrl
      ? `<div style="margin:20px 0;padding:16px;background:#f0f4ff;border-left:4px solid ${PRIMARY};border-radius:0 4px 4px 0;">
          <p style="margin:0 0 6px;color:#444444;font-size:14px;">Your tuition for ${escapeHtml(input.programName ?? "your programme")} is <strong>${escapeHtml(formatMoney(input.tuition.amountCents, input.tuition.currency))}</strong>.${input.tuition.pricingNote ? ` ${escapeHtml(input.tuition.pricingNote)}` : ""}</p>
          <a href="${escapeHtml(tuitionUrl)}" style="color:${PRIMARY};font-size:14px;font-weight:bold;">View tuition &rarr;</a>
        </div>`
      : "";

  const steps = details.nextSteps
    .map((s, i) => {
      const title = fill(s.title);
      const desc = fill(s.description);
      const url = safeHttpUrl(s.url);
      return `<tr>
        <td style="padding:10px 0;vertical-align:top;width:32px;">
          <div style="width:28px;height:28px;border-radius:50%;background:${PRIMARY};color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:28px;">${i + 1}</div>
        </td>
        <td style="padding:10px 0 10px 12px;vertical-align:top;">
          <p style="margin:0;color:${PRIMARY};font-size:14px;font-weight:bold;">${escapeHtml(title)}</p>
          ${desc ? `<p style="margin:4px 0 0;color:#666666;font-size:13px;line-height:1.5;">${textToHtml(desc)}</p>` : ""}
          ${url ? `<p style="margin:6px 0 0;font-size:13px;"><a href="${escapeHtml(url)}" style="color:${ACCENT};font-weight:bold;">Open link &rarr;</a></p>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const docs = details.requiredDocuments.length
    ? `${sectionTitle("Documents to bring or upload")}
       <ul style="margin:0 0 8px;padding-left:20px;color:#444444;font-size:14px;line-height:1.7;">
         ${details.requiredDocuments.map((d) => `<li>${escapeHtml(fill(d))}</li>`).join("")}
       </ul>`
    : "";

  const links = details.extraLinks
    .map((l) => ({ label: fill(l.label), url: safeHttpUrl(l.url) }))
    .filter((l) => l.url);
  const linksBlock = links.length
    ? `${sectionTitle("Useful links")}
       <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;line-height:1.7;">
         ${links.map((l) => `<li><a href="${escapeHtml(l.url!)}" style="color:${PRIMARY};">${escapeHtml(l.label)}</a></li>`).join("")}
       </ul>`
    : "";

  const contactParts: string[] = [];
  if (details.contactName) contactParts.push(`<strong>${escapeHtml(details.contactName)}</strong>`);
  if (details.contactEmail) contactParts.push(`<a href="mailto:${escapeHtml(details.contactEmail)}" style="color:${PRIMARY};">${escapeHtml(details.contactEmail)}</a>`);
  if (details.contactPhone) contactParts.push(escapeHtml(details.contactPhone));
  const contact = contactParts.length
    ? `<div style="margin:28px 0 0;padding:16px;background:#f9f9f9;border-radius:6px;">
        <p style="margin:0 0 4px;color:#666666;font-size:13px;font-weight:bold;">Questions? Contact us</p>
        <p style="margin:0;color:#444444;font-size:14px;line-height:1.6;">${contactParts.join("<br/>")}</p>
      </div>`
    : "";

  const body = `
    <h1 style="margin:0 0 16px;color:${PRIMARY};font-size:24px;font-weight:bold;">${escapeHtml(headline)}</h1>
    ${message
      .split(/\n{2,}/)
      .map((para) => p(textToHtml(para)))
      .join("")}
    ${summary}
    ${tuitionBlock}
    ${steps ? `${sectionTitle("Your next steps")}<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${steps}</table>` : ""}
    ${docs}
    ${linksBlock}
    ${accountUrl ? `<div style="text-align:center;margin:32px 0 8px;">${cta(accountUrl, input.account.label)}</div>` : ""}
    ${input.account.hint ? `<p style="margin:0;text-align:center;color:#999999;font-size:12px;">${escapeHtml(input.account.hint)}</p>` : ""}
    ${contact}
  `;

  const html = baseLayout(subject, body, {
    confetti: true,
    headerTitle: escapeHtml(input.school.name),
    headerLogoUrl: input.school.logoUrl ?? undefined,
  });

  const textLines: string[] = [headline, "", message, ""];
  for (const [k, v] of summaryRows) textLines.push(`${k}: ${v}`);
  if (input.tuition && tuitionUrl) textLines.push(`View tuition: ${tuitionUrl}`);
  if (details.nextSteps.length) {
    textLines.push("", "Your next steps:");
    details.nextSteps.forEach((s, i) => {
      const url = safeHttpUrl(s.url);
      textLines.push(`${i + 1}. ${fill(s.title)}${s.description ? ` - ${fill(s.description)}` : ""}${url ? ` (${url})` : ""}`);
    });
  }
  if (details.requiredDocuments.length) {
    textLines.push("", "Documents:");
    details.requiredDocuments.forEach((d) => textLines.push(`- ${fill(d)}`));
  }
  for (const l of links) textLines.push(`${l.label}: ${l.url}`);
  if (accountUrl) textLines.push("", `${input.account.label}: ${accountUrl}`);
  if (contactParts.length) textLines.push("", `Contact: ${[details.contactName, details.contactEmail, details.contactPhone].filter(Boolean).join(", ")}`);

  return { subject, html, text: textLines.join("\n") };
}
