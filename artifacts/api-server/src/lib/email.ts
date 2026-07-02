import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[email] Missing required SMTP env vars (SMTP_HOST, SMTP_USER, SMTP_PASS). Email sending is disabled.');
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

const FROM = process.env.SMTP_FROM ?? 'SolomonQuest <solomonquest@tilogics.com>';

const PRIMARY = '#1a1a2e';
const ACCENT = '#e94560';

function baseLayout(title: string, body: string, options?: { confetti?: boolean; headerTitle?: string }): string {
  const confettiRow = options?.confetti
    ? `
          <!-- Confetti -->
          <tr>
            <td style="background:${PRIMARY};padding:0 40px 22px;text-align:center;font-size:26px;line-height:1;letter-spacing:6px;">
              &#127881; &#127882; &#10024; &#127880; &#127882; &#10024; &#127881;
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:${PRIMARY};padding:28px 40px${options?.confetti ? " 6px" : ""};">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px;">${options?.headerTitle ?? "SolomonQuest"}</p>
            </td>
          </tr>${confettiRow}
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;border-top:1px solid #eeeeee;">
              <p style="margin:0;color:#999999;font-size:12px;text-align:center;">
                &copy; ${new Date().getFullYear()} SolomonQuest &mdash; Tilogics. All rights reserved.<br/>
                You are receiving this email because of activity on your SolomonQuest account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;padding:14px 32px;background:${PRIMARY};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">${label}</a>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;color:${PRIMARY};font-size:22px;font-weight:bold;">${text}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;color:#444444;font-size:15px;line-height:1.6;">${text}</p>`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) return;

  try {
    await t.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[email] Failed to send email to ${to} (subject: "${subject}"):`, err);
  }
}

// ─── 1. Teacher Invite ───────────────────────────────────────────────────────

export interface TeacherInviteParams {
  to: string;
  schoolName: string;
  inviterName: string;
  inviteUrl: string;
  role?: string;
}

export async function sendTeacherInvite({
  to,
  schoolName,
  inviterName,
  inviteUrl,
  role = 'teacher',
}: TeacherInviteParams): Promise<void> {
  const subject = `You've been invited to join ${schoolName} on SolomonQuest`;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const body = `
    ${heading(`You've been invited to join ${schoolName}!`)}
    ${paragraph(`<strong>${inviterName}</strong> has invited you to join <strong>${schoolName}</strong> as a <strong>${roleLabel}</strong> on SolomonQuest.`)}
    ${paragraph('SolomonQuest is a modern learning management system that makes it easy to manage courses, engage students, and track progress.')}
    ${paragraph('Click the button below to accept your invitation and create your account:')}
    <div style="text-align:center;margin:32px 0;">
      <a href="${inviteUrl}" style="display:inline-block;padding:16px 40px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;letter-spacing:0.3px;">Accept Invitation</a>
    </div>
    <div style="margin:24px 0;padding:16px;background:#fff8e1;border-left:4px solid #f59e0b;border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#444444;font-size:13px;">
        <strong>This invitation expires in 7 days.</strong> After that, you'll need to request a new one from your administrator.
      </p>
    </div>
    ${paragraph(`<span style="color:#999999;font-size:13px;">If you didn't expect this invitation, you can ignore this email — no account will be created without your action.</span>`)}
  `;

  await send(to, subject, baseLayout(subject, body, { confetti: true, headerTitle: schoolName }));
}

// ─── 2. Course Assignment Notification ───────────────────────────────────────

export interface CourseAssignmentParams {
  to: string;
  teacherName: string;
  courseTitle: string;
  schoolName: string;
}

export async function sendCourseAssignmentNotification({
  to,
  teacherName,
  courseTitle,
  schoolName,
}: CourseAssignmentParams): Promise<void> {
  const subject = `You've been assigned to teach ${courseTitle}`;

  const body = `
    ${heading('New Course Assignment')}
    ${paragraph(`Hi <strong>${teacherName}</strong>,`)}
    ${paragraph(`You have been assigned to teach <strong>${courseTitle}</strong> at <strong>${schoolName}</strong> on SolomonQuest.`)}
    ${paragraph('You can now access the course dashboard to upload resources, manage assignments, and engage with your students.')}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      <tr style="background:#f9f9f9;">
        <td style="padding:12px 16px;color:#666666;font-size:13px;font-weight:bold;width:40%;">Course</td>
        <td style="padding:12px 16px;color:#333333;font-size:13px;">${courseTitle}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#666666;font-size:13px;font-weight:bold;">School</td>
        <td style="padding:12px 16px;color:#333333;font-size:13px;">${schoolName}</td>
      </tr>
    </table>
    ${paragraph('Log in to your SolomonQuest account to get started.')}
  `;

  await send(to, subject, baseLayout(subject, body));
}

// ─── 3. Application Status Update ────────────────────────────────────────────

export interface ApplicationStatusParams {
  to: string;
  studentName: string;
  schoolName: string;
  status: string;
  reason?: string;
}

export async function sendApplicationStatusUpdate({
  to,
  studentName,
  schoolName,
  status,
  reason,
}: ApplicationStatusParams): Promise<void> {
  const subject = `Your application to ${schoolName} has been updated`;

  const statusUpper = status.toUpperCase();
  const isApproved = /approved|accepted/i.test(status);
  const isRejected = /rejected|declined|denied/i.test(status);

  const badgeColor = isApproved ? '#22c55e' : isRejected ? '#ef4444' : '#f59e0b';

  const statusBadge = `
    <div style="display:inline-block;margin:16px 0;padding:8px 20px;background:${badgeColor};color:#ffffff;border-radius:20px;font-size:14px;font-weight:bold;letter-spacing:0.5px;">
      ${statusUpper}
    </div>
  `;

  const reasonBlock = reason
    ? `<div style="margin:16px 0;padding:16px;background:#fff3f3;border-left:4px solid #ef4444;border-radius:0 4px 4px 0;">
        <p style="margin:0;color:#666666;font-size:13px;font-weight:bold;">Reason provided:</p>
        <p style="margin:6px 0 0;color:#444444;font-size:14px;">${reason}</p>
      </div>`
    : '';

  const body = `
    ${heading(`Application Update: ${schoolName}`)}
    ${paragraph(`Hi <strong>${studentName}</strong>,`)}
    ${paragraph(`Your application to <strong>${schoolName}</strong> on SolomonQuest has been reviewed and updated.`)}
    <p style="margin:8px 0 4px;color:#666666;font-size:13px;">Status:</p>
    ${statusBadge}
    ${reasonBlock}
    ${isApproved ? paragraph('Welcome aboard! You can now log in to SolomonQuest and access your courses.') : ''}
    ${paragraph('If you have any questions, please contact your school administrator.')}
  `;

  await send(to, subject, baseLayout(subject, body));
}

// ─── 4. Password Reset ───────────────────────────────────────────────────────

export interface PasswordResetParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: PasswordResetParams): Promise<void> {
  const subject = 'Reset your SolomonQuest password';

  const body = `
    ${heading('Password Reset Request')}
    ${paragraph('We received a request to reset the password for your SolomonQuest account.')}
    ${paragraph('Click the button below to choose a new password:')}
    <div style="text-align:center;">${button(resetUrl, 'Reset Password')}</div>
    <div style="margin-top:28px;padding:16px;background:#fff8e1;border-left:4px solid #f59e0b;border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#444444;font-size:13px;">
        <strong>Note:</strong> This link will expire in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email &mdash; your password will not change.
      </p>
    </div>
  `;

  await send(to, subject, baseLayout(subject, body));
}

// ─── 5. Resource Notification ─────────────────────────────────────────────────

export interface ResourceNotificationParams {
  to: string;
  studentName: string;
  courseTitle: string;
  resourceTitle: string;
  resourceType: string;
}

export async function sendResourceNotification({
  to,
  studentName,
  courseTitle,
  resourceTitle,
  resourceType,
}: ResourceNotificationParams): Promise<void> {
  const subject = `New resource added to ${courseTitle}`;

  const typeLabel = resourceType.charAt(0).toUpperCase() + resourceType.slice(1).toLowerCase();

  const body = `
    ${heading('New Course Resource Available')}
    ${paragraph(`Hi <strong>${studentName}</strong>,`)}
    ${paragraph(`A new resource has been added to your course <strong>${courseTitle}</strong>:`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      <tr style="background:#f9f9f9;">
        <td style="padding:12px 16px;color:#666666;font-size:13px;font-weight:bold;width:40%;">Resource</td>
        <td style="padding:12px 16px;color:#333333;font-size:13px;">${resourceTitle}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#666666;font-size:13px;font-weight:bold;">Type</td>
        <td style="padding:12px 16px;">
          <span style="display:inline-block;padding:3px 10px;background:${PRIMARY};color:#ffffff;border-radius:12px;font-size:12px;">${typeLabel}</span>
        </td>
      </tr>
      <tr style="background:#f9f9f9;">
        <td style="padding:12px 16px;color:#666666;font-size:13px;font-weight:bold;">Course</td>
        <td style="padding:12px 16px;color:#333333;font-size:13px;">${courseTitle}</td>
      </tr>
    </table>
    ${paragraph('Log in to SolomonQuest to view this resource.')}
  `;

  await send(to, subject, baseLayout(subject, body));
}

// ─── 6. Forum Notification ───────────────────────────────────────────────────

export interface ForumNotificationParams {
  to: string;
  userName: string;
  topicTitle: string;
  notificationType: 'comment' | 'reaction';
}

export async function sendForumNotification({
  to,
  userName,
  topicTitle,
  notificationType,
}: ForumNotificationParams): Promise<void> {
  const isComment = notificationType === 'comment';
  const subject = isComment
    ? `Someone commented on your topic: ${topicTitle}`
    : `Someone reacted to your topic: ${topicTitle}`;

  const actionLabel = isComment ? 'left a comment on' : 'reacted to';
  const icon = isComment ? '&#128172;' : '&#128077;';

  const body = `
    ${heading(`Forum Activity on Your Topic`)}
    ${paragraph(`Hi <strong>${userName}</strong>,`)}
    ${paragraph(`Someone ${actionLabel} your forum topic: <strong>${topicTitle}</strong>. ${icon}`)}
    ${paragraph('Log in to SolomonQuest to see the latest activity on your topic and continue the conversation.')}
    <div style="margin:20px 0;padding:16px;background:#f0f4ff;border-left:4px solid ${PRIMARY};border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#444444;font-size:14px;font-style:italic;">"${topicTitle}"</p>
    </div>
    ${paragraph(`<span style="color:#999999;font-size:13px;">You are receiving this notification because you posted this topic. You can manage your notification preferences in your account settings.</span>`)}
  `;

  await send(to, subject, baseLayout(subject, body));
}

// ─── 7. Welcome Email ─────────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  to: string;
  firstName: string;
  schoolName?: string;
  role?: string;
  loginUrl: string;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  schoolName,
  role = 'student',
  loginUrl,
}: WelcomeEmailParams): Promise<void> {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const subject = `Welcome to SolomonQuest${schoolName ? ` — ${schoolName}` : ''}! 🎉`;

  const featureRows = [
    ['📚', 'Courses', 'Access all your enrolled courses and learning materials in one place.'],
    ['📝', 'Assignments', 'Submit assignments and track your progress effortlessly.'],
    ['💬', 'Forum', 'Connect with peers and teachers through the school community forum.'],
    ['🔔', 'Notifications', 'Stay updated with real-time alerts for grades and announcements.'],
  ];

  const featuresHtml = featureRows.map(([icon, title, desc]) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:36px;font-size:20px;">${icon}</td>
      <td style="padding:10px 0 10px 12px;vertical-align:top;">
        <p style="margin:0;color:${PRIMARY};font-size:14px;font-weight:bold;">${title}</p>
        <p style="margin:4px 0 0;color:#666666;font-size:13px;line-height:1.5;">${desc}</p>
      </td>
    </tr>
  `).join('');

  const body = `
    ${heading(`Welcome to SolomonQuest, ${firstName}! 🎉`)}
    ${schoolName ? paragraph(`You've successfully joined <strong>${schoolName}</strong> as a <strong>${roleLabel}</strong>. We're thrilled to have you on board.`) : paragraph(`Your SolomonQuest account is ready. Welcome aboard!`)}
    ${paragraph('Here\'s what you can do on SolomonQuest:')}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      ${featuresHtml}
    </table>
    <div style="text-align:center;margin:32px 0;">
      <a href="${loginUrl}" style="display:inline-block;padding:16px 40px;background:${PRIMARY};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;letter-spacing:0.3px;">Go to My Dashboard &rarr;</a>
    </div>
    <div style="margin:24px 0;padding:16px;background:#f0f4ff;border-left:4px solid ${PRIMARY};border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#444444;font-size:13px;">
        <strong>Need help?</strong> Visit the Help Center inside SolomonQuest or reach out to your school administrator.
      </p>
    </div>
    ${paragraph('<span style="color:#999999;font-size:13px;">If you didn\'t create this account, please contact us immediately.</span>')}
  `;

  await send(to, subject, baseLayout(subject, body));
}

// ─── 8. Enhanced Invitation (with step-by-step accept flow) ──────────────────

export interface EnhancedInviteParams {
  to: string;
  schoolName: string;
  inviterName: string;
  inviteUrl: string;
  role?: string;
  expiresInDays?: number;
}

export async function sendEnhancedInvite({
  to,
  schoolName,
  inviterName,
  inviteUrl,
  role = 'teacher',
  expiresInDays = 7,
}: EnhancedInviteParams): Promise<void> {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const subject = `You're invited to join ${schoolName} on SolomonQuest`;

  const steps = [
    ['1', 'Click the button below', `You'll be taken to SolomonQuest to set up your account.`],
    ['2', 'Create your password', 'Choose a secure password for your new account.'],
    ['3', 'Access your dashboard', `You'll land directly in your ${roleLabel} dashboard, ready to go.`],
  ];

  const stepsHtml = steps.map(([num, title, desc]) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:32px;">
        <div style="width:28px;height:28px;border-radius:50%;background:${PRIMARY};color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:28px;">${num}</div>
      </td>
      <td style="padding:10px 0 10px 12px;vertical-align:top;">
        <p style="margin:0;color:${PRIMARY};font-size:14px;font-weight:bold;">${title}</p>
        <p style="margin:4px 0 0;color:#666666;font-size:13px;line-height:1.5;">${desc}</p>
      </td>
    </tr>
  `).join('');

  const body = `
    ${heading(`You've been invited to join ${schoolName}!`)}
    ${paragraph(`<strong>${inviterName}</strong> has invited you to join <strong>${schoolName}</strong> on SolomonQuest as a <strong>${roleLabel}</strong>.`)}
    ${paragraph('SolomonQuest is a modern learning management system for managing courses, assignments, and student engagement.')}
    <p style="margin:20px 0 8px;color:${PRIMARY};font-size:15px;font-weight:bold;">How to get started in 3 steps:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${stepsHtml}
    </table>
    <div style="text-align:center;margin:32px 0;">
      <a href="${inviteUrl}" style="display:inline-block;padding:16px 40px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;letter-spacing:0.3px;">Accept Invitation &rarr;</a>
    </div>
    <div style="margin:24px 0;padding:16px;background:#fff8e1;border-left:4px solid #f59e0b;border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#444444;font-size:13px;">
        <strong>This invitation expires in ${expiresInDays} days.</strong> After that, you'll need to request a new one from your administrator.
      </p>
    </div>
    ${paragraph('<span style="color:#999999;font-size:13px;">If you weren\'t expecting this invitation, you can safely ignore this email. No account will be created without your action.</span>')}
  `;

  await send(to, subject, baseLayout(subject, body, { confetti: true, headerTitle: schoolName }));
}

// ─── 9. Broadcast Message ─────────────────────────────────────────────────────

export interface BroadcastEmailParams {
  to: string;
  recipientName: string;
  subject: string;
  message: string;
  senderName: string;
  schoolName: string;
}

export async function sendBroadcastEmail({
  to,
  recipientName,
  subject,
  message,
  senderName,
  schoolName,
}: BroadcastEmailParams): Promise<void> {
  const body = `
    ${heading(subject)}
    ${paragraph(`Hi <strong>${recipientName}</strong>,`)}
    ${paragraph(message.replace(/\n/g, '<br/>'))}
    <div style="margin:24px 0;padding:16px;background:#f0f4ff;border-left:4px solid ${PRIMARY};border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#666666;font-size:13px;">
        Sent by <strong>${senderName}</strong> via ${schoolName} on SolomonQuest.
      </p>
    </div>
  `;

  await send(to, subject, baseLayout(subject, body));
}
