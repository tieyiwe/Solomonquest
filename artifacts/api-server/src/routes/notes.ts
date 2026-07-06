import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

async function getAccess(
  noteId: string,
  userId: string
): Promise<{ note: any; role: "owner" | "edit" | "view" | null }> {
  const { data: note } = await supabaseAdmin.from("notes").select("*").eq("id", noteId).single();
  if (!note) return { note: null, role: null };
  if (note.owner_id === userId) return { note, role: "owner" };

  const { data: share } = await supabaseAdmin
    .from("note_shares")
    .select("permission")
    .eq("note_id", noteId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!share) return { note, role: null };
  return { note, role: share.permission === "edit" ? "edit" : "view" };
}

// ─── GET /notes — list notes I own or that are shared with me ─────────────────

router.get(
  "/notes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId, schoolId } = req;
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const [{ data: owned, error: ownedError }, { data: shares, error: sharesError }] =
        await Promise.all([
          supabaseAdmin
            .from("notes")
            .select("*")
            .eq("school_id", schoolId)
            .eq("owner_id", userId)
            .order("updated_at", { ascending: false }),
          supabaseAdmin
            .from("note_shares")
            .select("permission, notes(*)")
            .eq("user_id", userId),
        ]);

      if (ownedError || sharesError) {
        res.status(500).json({ error: (ownedError ?? sharesError)?.message });
        return;
      }

      const sharedNotes = (shares ?? [])
        .filter((s: any) => s.notes && s.notes.school_id === schoolId)
        .map((s: any) => ({ ...s.notes, permission: s.permission, shared: true }));

      const ownedNotes = (owned ?? []).map((n: any) => ({ ...n, permission: "owner", shared: false }));

      // Fetch share counts for owned notes (for a "Shared with N people" badge)
      const ownedIds = ownedNotes.map((n: any) => n.id);
      let shareCounts: Record<string, number> = {};
      if (ownedIds.length > 0) {
        const { data: allShares } = await supabaseAdmin
          .from("note_shares")
          .select("note_id")
          .in("note_id", ownedIds);
        for (const s of allShares ?? []) {
          shareCounts[s.note_id] = (shareCounts[s.note_id] ?? 0) + 1;
        }
      }

      const notes = [
        ...ownedNotes.map((n: any) => ({ ...n, shareCount: shareCounts[n.id] ?? 0 })),
        ...sharedNotes,
      ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      res.json({ notes });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── POST /notes — create a note ───────────────────────────────────────────────

router.post(
  "/notes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId, schoolId } = req;
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { title, content, color } = req.body as { title?: string; content?: string; color?: string };

      const { data, error } = await supabaseAdmin
        .from("notes")
        .insert({
          school_id: schoolId,
          owner_id: userId,
          title: title ?? null,
          content: content ?? "",
          color: color ?? "#fef08a",
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json({ ...data, permission: "owner", shared: false, shareCount: 0 });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── PATCH /notes/:id — update a note ──────────────────────────────────────────

router.patch(
  "/notes/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { note, role } = await getAccess(id, userId!);
      if (!note) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      if (role === null || role === "view") {
        res.status(403).json({ error: "You do not have permission to edit this note" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.content !== undefined) updates.content = body.content;
      if (body.color !== undefined) updates.color = body.color;

      // Sticky position/size/mode is owner-controlled only, to avoid
      // multiple collaborators fighting over placement.
      if (role === "owner") {
        if (body.is_sticky !== undefined) updates.is_sticky = body.is_sticky;
        if (body.pos_x !== undefined) updates.pos_x = body.pos_x;
        if (body.pos_y !== undefined) updates.pos_y = body.pos_y;
        if (body.width !== undefined) updates.width = body.width;
        if (body.height !== undefined) updates.height = body.height;
      }

      const { data, error } = await supabaseAdmin
        .from("notes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── DELETE /notes/:id — delete a note (owner only) ───────────────────────────

router.delete(
  "/notes/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { note, role } = await getAccess(id, userId!);
      if (!note) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      if (role !== "owner") {
        res.status(403).json({ error: "Only the note owner can delete it" });
        return;
      }

      const { error } = await supabaseAdmin.from("notes").delete().eq("id", id);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── GET /notes/:id/shares — list who a note is shared with (owner only) ─────

router.get(
  "/notes/:id/shares",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { note, role } = await getAccess(id, userId!);
      if (!note) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      if (role !== "owner") {
        res.status(403).json({ error: "Only the note owner can view sharing" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("note_shares")
        .select("id, permission, user_id, profiles:user_id(first_name, last_name, internal_email)")
        .eq("note_id", id);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        shares: (data ?? []).map((s: any) => ({
          id: s.id,
          userId: s.user_id,
          permission: s.permission,
          firstName: s.profiles?.first_name ?? null,
          lastName: s.profiles?.last_name ?? null,
          email: s.profiles?.internal_email ?? null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── POST /notes/:id/share — share a note with another user (owner only) ─────

router.post(
  "/notes/:id/share",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { user_id: shareWithUserId, permission = "view" } = req.body as {
        user_id?: string;
        permission?: string;
      };

      if (!shareWithUserId) {
        res.status(400).json({ error: "user_id is required" });
        return;
      }
      if (shareWithUserId === userId) {
        res.status(400).json({ error: "You already have access to your own note" });
        return;
      }

      const { note, role } = await getAccess(id, userId!);
      if (!note) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      if (role !== "owner") {
        res.status(403).json({ error: "Only the note owner can share it" });
        return;
      }

      // Defense-in-depth: only let a note be shared with someone in the same
      // school, even though nothing today lets a caller discover another
      // school's user ids to exploit this.
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("school_id")
        .eq("id", shareWithUserId)
        .maybeSingle();
      if (!targetProfile || targetProfile.school_id !== note.school_id) {
        res.status(400).json({ error: "Can only share notes with users in your own school" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("note_shares")
        .upsert(
          { note_id: id, user_id: shareWithUserId, permission: permission === "edit" ? "edit" : "view" },
          { onConflict: "note_id,user_id" }
        )
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── DELETE /notes/:id/share/:userId — revoke a share (owner only) ───────────

router.delete(
  "/notes/:id/share/:userId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

      const { note, role } = await getAccess(id, userId!);
      if (!note) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      if (role !== "owner") {
        res.status(403).json({ error: "Only the note owner can manage sharing" });
        return;
      }

      const { error } = await supabaseAdmin
        .from("note_shares")
        .delete()
        .eq("note_id", id)
        .eq("user_id", targetUserId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

export default router;
