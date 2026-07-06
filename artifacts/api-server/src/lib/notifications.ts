import { supabaseAdmin } from "./supabase";
import { sendGenericNotificationEmail } from "./email";
import { logger } from "./logger";

type NotificationCategory = "chat" | "assignments" | "grades" | "resources" | "forum" | "applications" | "platform";

interface NotifyOptions {
  userIds: string[];
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
}

const APP_URL = process.env.APP_URL ?? process.env.FRONTEND_URL ?? "https://app.solomonquest.com";

/**
 * Creates an in-app notification row for each recipient (so they see it the
 * moment they're back online / the bell realtime-subscribes to it) and, for
 * anyone who hasn't opted out, also emails them — this is what actually
 * reaches someone whose tab isn't open, unlike the old chat-only-realtime
 * path which silently dropped messages for offline recipients.
 */
export async function notifyUsers({ userIds, type, category, title, body, link }: NotifyOptions): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return;

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email, notification_prefs")
    .in("id", uniqueIds);

  if (error) {
    logger.error({ err: error }, "Failed to look up profiles for notifyUsers");
    return;
  }

  const rows = uniqueIds.map((userId) => ({
    user_id: userId,
    type,
    title,
    body,
    link: link ?? null,
    metadata: {},
    is_read: false,
  }));

  const { error: insertError } = await supabaseAdmin.from("notifications").insert(rows);
  if (insertError) {
    logger.error({ err: insertError }, "Failed to insert notification rows");
  }

  await Promise.all(
    (profiles ?? []).map(async (p) => {
      const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;
      const emailAllowed = prefs.email !== false && prefs[category] !== false;
      if (!emailAllowed || !p.email) return;

      const recipientName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "there";
      try {
        await sendGenericNotificationEmail({
          to: p.email as string,
          recipientName,
          title,
          body,
          link,
          appUrl: APP_URL,
        });
      } catch (err) {
        logger.error({ err }, "Failed to send notification email");
      }
    })
  );
}
