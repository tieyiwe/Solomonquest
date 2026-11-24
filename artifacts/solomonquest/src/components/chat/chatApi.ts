import { supabase } from "@/lib/supabase";
import type { Channel, ChatMessage } from "./types";

export async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

export async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? `${fallback} (${res.status})`;
}

/**
 * The REST chat API returns camelCase fields (createdAt, threadParentId,
 * channelId, replyCount, isEdited, editedAt), while realtime INSERT payloads
 * are raw snake_case chat_messages rows. Every message — REST or realtime —
 * goes through this so the UI reads one shape.
 */
export function normalizeMessage(raw: any): ChatMessage {
  const sender = raw.sender ?? {};
  return {
    ...raw,
    channel_id: raw.channel_id ?? raw.channelId,
    thread_parent_id: raw.thread_parent_id ?? raw.threadParentId ?? null,
    thread_count: raw.thread_count ?? raw.replyCount ?? 0,
    created_at: raw.created_at ?? raw.createdAt,
    attachmentUrl: raw.attachmentUrl ?? raw.attachment_url ?? null,
    attachmentName: raw.attachmentName ?? raw.attachment_name ?? null,
    attachmentType: raw.attachmentType ?? raw.attachment_type ?? null,
    attachmentSize: raw.attachmentSize ?? raw.attachment_size ?? null,
    isEdited: raw.isEdited ?? raw.is_edited ?? false,
    editedAt: raw.editedAt ?? raw.edited_at ?? null,
    reactions: raw.reactions ?? [],
    sender: {
      ...sender,
      id: sender.id ?? raw.sender_id ?? "",
      name: sender.name ?? "",
      avatar_url: sender.avatar_url ?? sender.avatarUrl ?? null,
    },
  };
}

/** GET /chat/channels returns camelCase counters; the UI reads snake_case. */
export function normalizeChannel(raw: any): Channel {
  return {
    ...raw,
    unread_count: raw.unread_count ?? raw.unreadCount ?? 0,
    member_count: raw.member_count ?? raw.memberCount ?? null,
    lastReadAt: raw.lastReadAt ?? null,
    lastMessage: raw.lastMessage ?? null,
  };
}

/**
 * Multipart upload through the API (which virus-scans before storing), via
 * XHR so the UI can show real upload progress.
 */
export async function uploadAttachment(
  channelId: string,
  file: File,
  onProgress: (pct: number) => void,
  threadParentId?: string | null
): Promise<ChatMessage> {
  const token = await getToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/chat/channels/${channelId}/attachments`);
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(normalizeMessage(body));
      } else {
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error — file not sent"));
    const form = new FormData();
    form.append("file", file);
    if (threadParentId) form.append("threadParentId", threadParentId);
    xhr.send(form);
  });
}
