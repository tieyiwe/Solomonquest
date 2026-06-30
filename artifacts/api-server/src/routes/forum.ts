import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Content length limits
// ---------------------------------------------------------------------------
const TITLE_MAX_LENGTH = 255;
const CONTENT_MAX_LENGTH = 10000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, avatar_url")
    .eq("id", userId)
    .single();
  return data ?? null;
}

async function createNotification(
  userId: string,
  title: string,
  link: string
) {
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    title,
    link,
    is_read: false,
  });
}

async function enrichTopic(topic: Record<string, unknown>) {
  const [profile, commentCountRes, reactionCountRes] = await Promise.all([
    topic.posted_by ? getProfile(topic.posted_by as string) : Promise.resolve(null),
    supabaseAdmin
      .from("forum_comments")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id as string),
    supabaseAdmin
      .from("forum_reactions")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id as string),
  ]);

  return {
    id: topic.id,
    schoolId: topic.school_id,
    courseId: topic.course_id,
    title: topic.title,
    content: topic.content,
    coverImage: topic.cover_image ?? null,
    isPinned: topic.is_pinned,
    postedBy: topic.posted_by,
    postedByProfile: profile,
    commentCount: commentCountRes.count ?? 0,
    reactionCount: reactionCountRes.count ?? 0,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
  };
}

async function enrichComment(comment: Record<string, unknown>) {
  const [profile, reactionCountRes] = await Promise.all([
    comment.posted_by ? getProfile(comment.posted_by as string) : Promise.resolve(null),
    supabaseAdmin
      .from("forum_reactions")
      .select("id", { count: "exact", head: true })
      .eq("comment_id", comment.id as string),
  ]);

  return {
    id: comment.id,
    topicId: comment.topic_id,
    content: comment.content,
    postedBy: comment.posted_by,
    postedByProfile: profile,
    reactionCount: reactionCountRes.count ?? 0,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /forum/topics — list topics
// ---------------------------------------------------------------------------
router.get(
  "/forum/topics",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    let query = supabaseAdmin
      .from("forum_topics")
      .select("*")
      .eq("school_id", req.schoolId ?? "")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (req.query.courseId) {
      query = query.eq("course_id", req.query.courseId as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const topics = await Promise.all((data ?? []).map(enrichTopic));
    res.json(topics);
  }
);

// ---------------------------------------------------------------------------
// POST /forum/topics — create topic (teacher/admin only)
// ---------------------------------------------------------------------------
router.post(
  "/forum/topics",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    // Role check: only teachers and admins (including super_admin) may create topics
    if (
      req.userRole !== "teacher" &&
      req.userRole !== "admin" &&
      req.userRole !== "super_admin"
    ) {
      res.status(403).json({ error: "Only teachers and admins can create topics" });
      return;
    }

    const { courseId, isPinned } = req.body;

    // Content sanitization: trim and enforce length limits
    const title: string = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const content: string =
      typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    if (title.length > TITLE_MAX_LENGTH) {
      res.status(400).json({
        error: `title must be at most ${TITLE_MAX_LENGTH} characters`,
      });
      return;
    }

    if (content.length > CONTENT_MAX_LENGTH) {
      res.status(400).json({
        error: `content must be at most ${CONTENT_MAX_LENGTH} characters`,
      });
      return;
    }

    const coverImage = typeof req.body.coverImage === "string" ? req.body.coverImage.trim() : null;

    const { data, error } = await supabaseAdmin
      .from("forum_topics")
      .insert({
        school_id: req.schoolId,
        title,
        content: content || null,
        course_id: courseId ?? null,
        is_pinned: isPinned ?? false,
        posted_by: req.userId,
        cover_image: coverImage || null,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json(await enrichTopic(data));
  }
);

// ---------------------------------------------------------------------------
// GET /forum/topics/:topicId — single topic with comments and reactions
// ---------------------------------------------------------------------------
router.get(
  "/forum/topics/:topicId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;

    const { data: topic, error: topicError } = await supabaseAdmin
      .from("forum_topics")
      .select("*")
      .eq("id", topicId)
      .single();

    if (topicError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const [enrichedTopic, commentsRes, topicReactionsRes] = await Promise.all([
      enrichTopic(topic),
      supabaseAdmin
        .from("forum_comments")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("forum_reactions")
        .select("*")
        .eq("topic_id", topicId),
    ]);

    if (commentsRes.error) {
      res.status(500).json({ error: commentsRes.error.message });
      return;
    }

    const enrichedComments = await Promise.all(
      (commentsRes.data ?? []).map(enrichComment)
    );

    // Attach per-comment reactions
    const commentIds = (commentsRes.data ?? []).map((c) => c.id as string);
    let commentReactions: Record<string, unknown>[] = [];
    if (commentIds.length > 0) {
      const { data: cr } = await supabaseAdmin
        .from("forum_reactions")
        .select("*")
        .in("comment_id", commentIds);
      commentReactions = cr ?? [];
    }

    const commentsWithReactions = enrichedComments.map((c) => ({
      ...c,
      reactions: commentReactions.filter((r) => r.comment_id === c.id),
    }));

    res.json({
      ...enrichedTopic,
      reactions: topicReactionsRes.data ?? [],
      comments: commentsWithReactions,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /forum/topics/:topicId/comments — add comment
// Any authenticated user may comment (open participation).
// NOTE: Rate limiting should be enforced at the infrastructure/middleware level
// (e.g. express-rate-limit) to prevent comment spam. Consider limiting to
// ~10 comments per user per minute per topic.
// ---------------------------------------------------------------------------
router.post(
  "/forum/topics/:topicId/comments",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;

    // Content sanitization: trim and enforce length limit
    const content: string =
      typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    if (content.length > CONTENT_MAX_LENGTH) {
      res.status(400).json({
        error: `content must be at most ${CONTENT_MAX_LENGTH} characters`,
      });
      return;
    }

    // Verify topic exists
    const { data: topic, error: topicError } = await supabaseAdmin
      .from("forum_topics")
      .select("id, title, posted_by")
      .eq("id", topicId)
      .single();

    if (topicError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const { data: newComment, error: insertError } = await supabaseAdmin
      .from("forum_comments")
      .insert({
        topic_id: topicId,
        content,
        posted_by: req.userId,
      })
      .select()
      .single();

    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }

    // Collect users to notify: topic author + all previous commenters
    const { data: prevComments } = await supabaseAdmin
      .from("forum_comments")
      .select("posted_by")
      .eq("topic_id", topicId)
      .neq("id", newComment.id);

    const usersToNotify = new Set<string>();

    if (topic.posted_by) {
      usersToNotify.add(topic.posted_by as string);
    }
    for (const c of prevComments ?? []) {
      if (c.posted_by) usersToNotify.add(c.posted_by as string);
    }
    // Do not notify the commenter themselves
    usersToNotify.delete(req.userId ?? "");

    const notifTitle = `New comment on: ${topic.title as string}`;
    const notifLink = `/forum/topics/${topicId}`;

    await Promise.all(
      Array.from(usersToNotify).map((uid) =>
        createNotification(uid, notifTitle, notifLink)
      )
    );

    res.status(201).json(await enrichComment(newComment));
  }
);

// ---------------------------------------------------------------------------
// POST /forum/topics/:topicId/react — react to topic
// ---------------------------------------------------------------------------
router.post(
  "/forum/topics/:topicId/react",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;
    const { reaction } = req.body;

    if (!reaction) {
      res.status(400).json({ error: "reaction is required" });
      return;
    }

    // Verify topic exists and get author
    const { data: topic, error: topicError } = await supabaseAdmin
      .from("forum_topics")
      .select("id, title, posted_by")
      .eq("id", topicId)
      .single();

    if (topicError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("forum_reactions")
      .upsert(
        {
          topic_id: topicId,
          comment_id: null,
          user_id: req.userId,
          reaction,
        },
        { onConflict: "topic_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Notify topic author if not self
    const authorId = topic.posted_by as string | null;
    if (authorId && authorId !== req.userId) {
      await createNotification(
        authorId,
        `Someone reacted to your topic: ${topic.title as string}`,
        `/forum/topics/${topicId}`
      );
    }

    res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// POST /forum/comments/:commentId/react — react to comment
// ---------------------------------------------------------------------------
router.post(
  "/forum/comments/:commentId/react",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { commentId } = req.params;
    const { reaction } = req.body;

    if (!reaction) {
      res.status(400).json({ error: "reaction is required" });
      return;
    }

    // Verify comment exists and get author + topic info
    const { data: comment, error: commentError } = await supabaseAdmin
      .from("forum_comments")
      .select("id, posted_by, topic_id")
      .eq("id", commentId)
      .single();

    if (commentError || !comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("forum_reactions")
      .upsert(
        {
          topic_id: null,
          comment_id: commentId,
          user_id: req.userId,
          reaction,
        },
        { onConflict: "comment_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Notify comment author if not self
    const authorId = comment.posted_by as string | null;
    if (authorId && authorId !== req.userId) {
      await createNotification(
        authorId,
        "Someone reacted to your comment",
        `/forum/topics/${comment.topic_id as string}`
      );
    }

    res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// DELETE /forum/topics/:topicId — delete topic (admin or teacher who posted)
// ---------------------------------------------------------------------------
router.delete(
  "/forum/topics/:topicId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;

    const { data: topic, error: fetchError } = await supabaseAdmin
      .from("forum_topics")
      .select("id, posted_by")
      .eq("id", topicId)
      .single();

    if (fetchError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    const isOwnerTeacher =
      req.userRole === "teacher" && topic.posted_by === req.userId;

    if (!isAdmin && !isOwnerTeacher) {
      res.status(403).json({ error: "Not authorized to delete this topic" });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("forum_topics")
      .delete()
      .eq("id", topicId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.sendStatus(204);
  }
);

// ---------------------------------------------------------------------------
// DELETE /forum/comments/:commentId — delete comment (poster or admin)
// ---------------------------------------------------------------------------
router.delete(
  "/forum/comments/:commentId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { commentId } = req.params;

    const { data: comment, error: fetchError } = await supabaseAdmin
      .from("forum_comments")
      .select("id, posted_by")
      .eq("id", commentId)
      .single();

    if (fetchError || !comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    const isPoster = comment.posted_by === req.userId;

    if (!isAdmin && !isPoster) {
      res.status(403).json({ error: "Not authorized to delete this comment" });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("forum_comments")
      .delete()
      .eq("id", commentId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.sendStatus(204);
  }
);

export default router;
