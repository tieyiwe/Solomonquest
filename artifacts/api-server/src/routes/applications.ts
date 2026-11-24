import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendApplicationStatusUpdate } from "../lib/email";
import { canApproveApplication, resolveApplicationFee } from "../lib/admissions";
import {
  ensureTuitionForApplication,
  feeConfigFromRow,
  loadProgramOverride,
  loadSchoolAdmissionSettings,
  runApprovalSideEffects,
} from "../lib/admissionApproval";

const router: IRouter = Router();

const VALID_STATUSES = [
  "submitted",
  "received",
  "under_review",
  "finalizing",
  "approved",
  "rejected",
] as const;

type ApplicationStatus = (typeof VALID_STATUSES)[number];

// ─── Helper: format a single application row ──────────────────────────────────

function formatApplication(a: Record<string, unknown>) {
  return {
    id: a.id,
    schoolId: a.school_id,
    applicantId: a.applicant_id,
    status: a.status,
    notes: a.notes,
    rejectionReason: a.rejection_reason,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    programId: a.program_id ?? null,
    ...formatFee(a),
  };
}

// Application fee + approval email fields (admissions-pricing.sql). Absent
// columns (migration not run yet) read as "free", which is today's flow.
export function formatFee(a: Record<string, unknown>) {
  return {
    feeStatus: (a.fee_status as string | undefined) ?? "not_required",
    feeAmountCents: (a.fee_amount_cents as number | null | undefined) ?? null,
    feeCurrency: (a.fee_currency as string | null | undefined) ?? null,
    feePaidAt: a.fee_paid_at ?? null,
    feeWaivedAt: a.fee_waived_at ?? null,
    feeWaivedBy: a.fee_waived_by ?? null,
    feeWaiverReason: a.fee_waiver_reason ?? null,
    congratsEmailStatus: a.congrats_email_status ?? null,
    congratsEmailSentAt: a.congrats_email_sent_at ?? null,
    congratsEmailError: a.congrats_email_error ?? null,
    tuitionPaymentId: a.tuition_payment_id ?? null,
  };
}

// ─── POST /applications ───────────────────────────────────────────────────────
// Student: submit a new application
router.post(
  "/applications",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId!;
    const {
      schoolId,
      courseIds: rawCourseIds,
      formResponses,
      programId,
    } = req.body as {
      schoolId?: string;
      courseIds?: string[];
      formResponses?: { fieldId: string; value: string }[];
      programId?: string | null;
    };

    if (!schoolId) {
      res.status(400).json({ error: "schoolId is required" });
      return;
    }

    // Applying to a program can stand on its own (its courses are enrolled
    // on approval); otherwise at least one course is still required.
    const courseIds = Array.isArray(rawCourseIds) ? rawCourseIds : [];
    if (courseIds.length === 0 && !programId) {
      res.status(400).json({ error: "courseIds must be a non-empty array" });
      return;
    }

    let chosenProgramId: string | null = null;
    if (programId) {
      const { data: program } = await supabaseAdmin
        .from("programs")
        .select("id, is_active")
        .eq("id", programId)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!program || program.is_active === false) {
        res.status(400).json({ error: "That program isn't open for applications at this school" });
        return;
      }
      chosenProgramId = program.id as string;
    }

    // Every selected course must actually belong to the school being
    // applied to — otherwise a caller could attach another school's course
    // ids to this application, corrupting that school's admissions data
    // and course-selection reporting cross-tenant.
    const { data: validCourses, error: courseCheckError } = courseIds.length
      ? await supabaseAdmin
          .from("courses")
          .select("id, program_id")
          .eq("school_id", schoolId)
          .in("id", courseIds)
      : { data: [] as { id: string; program_id: string | null }[], error: null };

    if (courseCheckError) {
      res.status(500).json({ error: courseCheckError.message });
      return;
    }

    const validCourseIds = new Set((validCourses ?? []).map((c) => c.id as string));
    if (courseIds.some((id) => !validCourseIds.has(id))) {
      res.status(400).json({ error: "One or more selected courses do not belong to this school" });
      return;
    }

    // Courses that all sit in one program count as applying to it, so the
    // program's price and fee apply to the plain course-picking flow too.
    if (!chosenProgramId && validCourses && validCourses.length > 0) {
      const programIds = new Set(validCourses.map((c) => (c as { program_id?: string | null }).program_id ?? null));
      const only = programIds.size === 1 ? Array.from(programIds)[0] : null;
      if (only) chosenProgramId = only;
    }

    // Application fee: free unless the school turned it on (and the program
    // doesn't override it to 0). The amount is fixed here, at submission, and
    // is what Checkout charges and the webhook checks against.
    const settingsRow = await loadSchoolAdmissionSettings(schoolId);
    const overrideRow = await loadProgramOverride(chosenProgramId, schoolId);
    const fee = resolveApplicationFee(
      feeConfigFromRow(settingsRow),
      (overrideRow?.application_fee_cents as number | null | undefined) ?? null
    );

    // 1. Create the application record. Fee columns are only written when a
    // fee applies, so a database without admissions-pricing.sql keeps
    // working exactly as before for free applications.
    const insertRow: Record<string, unknown> = {
      school_id: schoolId,
      applicant_id: userId,
      status: "submitted",
    };
    if (chosenProgramId) insertRow.program_id = chosenProgramId;
    if (fee.required) {
      insertRow.fee_status = "awaiting_payment";
      insertRow.fee_amount_cents = fee.amountCents;
      insertRow.fee_currency = fee.currency;
    }
    const { data: application, error: appError } = await supabaseAdmin
      .from("student_applications")
      .insert(insertRow)
      .select()
      .single();

    if (appError || !application) {
      res.status(400).json({ error: appError?.message ?? "Failed to create application" });
      return;
    }

    const applicationId = application.id as string;

    // 2. Insert course selections
    const courseSelections = courseIds.map((courseId) => ({
      application_id: applicationId,
      course_id: courseId,
    }));

    const { error: courseSelErr } = courseSelections.length
      ? await supabaseAdmin.from("application_course_selections").insert(courseSelections)
      : { error: null };

    if (courseSelErr) {
      res.status(500).json({ error: courseSelErr.message });
      return;
    }

    // 3. Insert form responses (if provided)
    if (Array.isArray(formResponses) && formResponses.length > 0) {
      const responseRows = formResponses.map((r) => ({
        application_id: applicationId,
        field_id: r.fieldId,
        value: r.value,
      }));

      const { error: responseErr } = await supabaseAdmin
        .from("application_form_responses")
        .insert(responseRows);

      if (responseErr) {
        res.status(500).json({ error: responseErr.message });
        return;
      }
    }

    // 4. Look up applicant name for notification
    const { data: applicantProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();

    const studentName = applicantProfile
      ? [applicantProfile.first_name, applicantProfile.last_name].filter(Boolean).join(" ")
      : "A student";

    // 5. Find the school admin to notify
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("school_id", schoolId)
      .eq("role", "admin")
      .limit(1)
      .single();

    // 6. Create in-app notification for school admin
    if (adminProfile?.id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: adminProfile.id,
        title: "New application received",
        body: `${studentName} has applied to your school`,
        is_read: false,
      });

      // 7. Send email notification to admin
      if (adminProfile.email) {
        const { data: school } = await supabaseAdmin
          .from("schools")
          .select("name")
          .eq("id", schoolId)
          .single();

        sendApplicationStatusUpdate({
          to: adminProfile.email,
          studentName,
          schoolName: school?.name ?? "your school",
          status: "submitted",
        }).catch((err) =>
          console.error("[applications] Failed to send admin email notification:", err)
        );
      }
    }

    res.status(201).json({ ...formatApplication(application), requiresPayment: fee.required });
  }
);

// ─── GET /applications ────────────────────────────────────────────────────────
// Admin: all applications for their school (with course selections + form responses)
// Student: their own applications with status
router.get(
  "/applications",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId!;
    const isAdmin =
      req.userRole === "admin" || req.userRole === "super_admin";

    if (isAdmin) {
      const schoolId = req.schoolId;
      if (!schoolId) {
        res.status(400).json({ error: "Admin is not associated with a school" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("student_applications")
        .select(
          `*,
           application_course_selections ( course_id, courses ( id, title ) ),
           application_form_responses ( field_id, value, application_form_fields ( label ) )`
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // The raw rows stay as they were (snake_case + nested selections);
      // camelCase fields the Admissions page reads are added alongside.
      const rows = (data ?? []) as Record<string, unknown>[];
      const applicantIds = Array.from(new Set(rows.map((r) => r.applicant_id as string).filter(Boolean)));
      const programIds = Array.from(new Set(rows.map((r) => r.program_id as string).filter(Boolean)));
      const [{ data: applicants }, { data: programs }] = await Promise.all([
        applicantIds.length
          ? supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", applicantIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        programIds.length
          ? supabaseAdmin.from("programs").select("id, name").in("id", programIds).eq("school_id", schoolId)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);
      const applicantById = new Map((applicants ?? []).map((p) => [p.id as string, p as Record<string, unknown>]));
      const programNameById = new Map((programs ?? []).map((p) => [p.id as string, p.name as string]));

      res.json(
        rows.map((r) => {
          const p = applicantById.get(r.applicant_id as string);
          const selections = (r.application_course_selections as { courses?: { title?: string } | null }[] | undefined) ?? [];
          const courseTitles = selections.map((sel) => sel.courses?.title).filter(Boolean) as string[];
          return {
            ...r,
            ...formatApplication(r),
            applicantName: p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || null : null,
            applicantEmail: (p?.email as string | undefined) ?? null,
            programName:
              (r.program_id ? programNameById.get(r.program_id as string) : null) ??
              (courseTitles.length ? courseTitles.join(", ") : null),
          };
        })
      );
      return;
    }

    // Student: own applications
    const { data, error } = await supabaseAdmin
      .from("student_applications")
      .select("*")
      .eq("applicant_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(
      (data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        schoolId: a.school_id,
        status: a.status,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        programId: a.program_id ?? null,
        feeStatus: (a.fee_status as string | undefined) ?? "not_required",
        feeAmountCents: a.fee_amount_cents ?? null,
        feeCurrency: a.fee_currency ?? null,
      }))
    );
  }
);

// ─── GET /applications/:id ────────────────────────────────────────────────────
// Get a single application with course selections and form responses (with field labels)
router.get(
  "/applications/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = req.params.id;
    const userId = req.userId!;
    const isAdmin =
      req.userRole === "admin" || req.userRole === "super_admin";

    const { data, error } = await supabaseAdmin
      .from("student_applications")
      .select(
        `*,
         application_course_selections ( course_id, courses ( id, title ) ),
         application_form_responses ( field_id, value, application_form_fields ( id, label, field_type ) )`
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    // Students can only view their own applications
    if (!isAdmin && data.applicant_id !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Admins can only view applications for their own school. The school
    // match used to be skipped entirely when req.schoolId was falsy, so an
    // admin whose profile has no school_id could read any school's
    // application (including every form response on it) by id. Only a
    // super_admin is school-less by design.
    if (isAdmin && req.userRole !== "super_admin" && data.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(data);
  }
);

// ─── PATCH /applications/:id/status ──────────────────────────────────────────
// Admin: update application status with optional notes / rejectionReason
router.patch(
  "/applications/:id/status",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const isAdmin =
      req.userRole === "admin" || req.userRole === "super_admin";

    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { status, notes, rejectionReason, waiveFee, waiverReason } = req.body as {
      status?: string;
      notes?: string;
      rejectionReason?: string;
      waiveFee?: boolean;
      waiverReason?: string;
    };

    if (!status || !VALID_STATUSES.includes(status as ApplicationStatus)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      });
      return;
    }

    // Fetch the existing application to validate school ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("student_applications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    // Same bypass as GET /applications/:id above, but worse here: a
    // school-less admin could approve another school's application, which
    // auto-enrolls the applicant and rewrites their profile's school_id.
    if (req.userRole !== "super_admin" && existing.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const approving = status === "approved";
    const alreadyApproved = existing.status === "approved";

    // An unpaid application fee blocks approval unless the admin waives it
    // here (recorded with who and when). See POST /applications/:id/waive-fee.
    const updatePayload: Record<string, unknown> = { status };
    if (approving && !alreadyApproved) {
      const gate = canApproveApplication(existing);
      if (!gate.ok) {
        if (!waiveFee) {
          res.status(409).json({ error: gate.reason, code: "fee_unpaid" });
          return;
        }
        updatePayload.fee_status = "waived";
        updatePayload.fee_waived_by = req.userId;
        updatePayload.fee_waived_at = new Date().toISOString();
        updatePayload.fee_waiver_reason = waiverReason?.trim().slice(0, 500) || null;
      }
    }

    // Build update payload
    if (notes !== undefined) updatePayload.notes = notes;
    if (rejectionReason !== undefined)
      updatePayload.rejection_reason = rejectionReason;
    if (approving && !alreadyApproved) {
      updatePayload.reviewed_by = req.userId;
      updatePayload.reviewed_at = new Date().toISOString();
    }

    // Approving claims the transition: only the request that actually moves
    // the row to "approved" runs enrolment/tuition/email, so a double click
    // (or two admins) can't enrol, bill or email twice.
    let updateQuery = supabaseAdmin.from("student_applications").update(updatePayload).eq("id", id);
    if (approving && !alreadyApproved) updateQuery = updateQuery.neq("status", "approved");
    if (updatePayload.fee_status === "waived") updateQuery = updateQuery.eq("fee_status", "awaiting_payment");
    const { data: updated, error: updateError } = await updateQuery.select().maybeSingle();

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }
    if (!updated) {
      // Someone else approved it (or paid/waived the fee) in the meantime.
      const { data: current } = await supabaseAdmin.from("student_applications").select("*").eq("id", id).single();
      if (current?.status === "approved") {
        res.json({ ...formatApplication(current), congratsEmail: null });
        return;
      }
      res.status(409).json({ error: "This application changed while you were working on it. Refresh and try again." });
      return;
    }

    if (approving) {
      if (alreadyApproved) {
        // Re-approving is a no-op apart from making sure tuition exists
        // (idempotent). The email isn't resent -- use "Resend
        // congratulations email" for that.
        const tuition = await ensureTuitionForApplication(updated);
        res.json({ ...formatApplication(updated), congratsEmail: null, tuition });
        return;
      }
      const outcome = await runApprovalSideEffects(updated);
      const { data: refreshed } = await supabaseAdmin.from("student_applications").select("*").eq("id", id).single();
      res.json({
        ...formatApplication(refreshed ?? updated),
        congratsEmail: outcome.congratsEmail,
        tuition: outcome.tuition,
      });
      return;
    }

    // Look up applicant details for notifications
    const { data: applicantProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("id", existing.applicant_id as string)
      .single();

    const studentName = applicantProfile
      ? [applicantProfile.first_name, applicantProfile.last_name]
          .filter(Boolean)
          .join(" ")
      : "Student";

    // Create in-app notification for applicant
    const statusLabel = status.replace(/_/g, " ");
    await supabaseAdmin.from("notifications").insert({
      user_id: existing.applicant_id,
      title: "Application status updated",
      body: `Your application status has been updated to: ${statusLabel}`,
      is_read: false,
    });

    // Send email notification to applicant
    if (applicantProfile?.email) {
      const { data: school } = await supabaseAdmin
        .from("schools")
        .select("name")
        .eq("id", existing.school_id as string)
        .single();

      sendApplicationStatusUpdate({
        to: applicantProfile.email,
        studentName,
        schoolName: school?.name ?? "your school",
        status,
        reason: rejectionReason,
      }).catch((err) =>
        console.error("[applications] Failed to send status update email:", err)
      );
    }

    res.json(formatApplication(updated));
  }
);


export default router;
