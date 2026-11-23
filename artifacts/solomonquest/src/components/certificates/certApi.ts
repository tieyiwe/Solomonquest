import type { CertificateData, CertificateSignatory } from "./CertificateView";
import { verifyUrlFor } from "./CertificateView";

/** GET /api/certificates/settings (camelCase, see api-server lib/certificates.ts). */
export interface CertificateSettings {
  schoolId: string;
  configured: boolean;
  enabled: boolean;
  logoUrl: string | null;
  title: string;
  bodyTemplate: string;
  signatories: CertificateSignatory[];
  accentColor: string;
  issueMode: "approval" | "auto";
  passPercent: number;
  teachersCanIssue: boolean;
  configuredAt: string | null;
  updatedAt: string | null;
  school?: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

/** A certificate row as the API returns it (mapCertificate). */
export interface Certificate {
  id: string;
  schoolId: string;
  studentId: string;
  courseId: string | null;
  programId: string | null;
  verificationCode: string;
  studentName: string;
  courseName: string | null;
  programName: string | null;
  schoolName: string;
  title: string;
  body: string;
  logoUrl: string | null;
  accentColor: string;
  signatories: CertificateSignatory[];
  finalPercent: number | null;
  issueMethod: "manual" | "approved" | "auto";
  issuedAt: string;
  status: "valid" | "revoked";
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface PendingCertificate {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  courseId: string;
  courseTitle: string;
  courseCode: string | null;
  finalPercent: number | null;
}

/** GET /api/certificates/verify/:code (public). */
export interface VerifyResult {
  verificationCode: string;
  valid: boolean;
  status: "valid" | "revoked";
  studentName: string;
  courseName: string | null;
  programName: string | null;
  schoolName: string;
  title: string;
  issuedAt: string;
  revokedAt: string | null;
  logoUrl: string | null;
  accentColor: string;
}

export const PLACEHOLDERS = ["{studentName}", "{courseName}", "{programName}", "{schoolName}", "{date}"] as const;

export function certificateToData(c: Certificate): CertificateData {
  return {
    title: c.title,
    body: c.body,
    studentName: c.studentName,
    schoolName: c.schoolName,
    logoUrl: c.logoUrl,
    accentColor: c.accentColor,
    signatories: c.signatories,
    issuedAt: c.issuedAt,
    verificationCode: c.verificationCode,
    verifyUrl: verifyUrlFor(c.verificationCode),
    status: c.status,
  };
}

export function awardName(c: Pick<Certificate, "courseName" | "programName">): string {
  return c.courseName || c.programName || "";
}
