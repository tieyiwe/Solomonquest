export type ChannelType = "public" | "course" | "private" | "direct";

export interface ChannelLastMessage {
  id?: string;
  content: string;
  createdAt: string;
  senderId?: string | null;
  senderName?: string | null;
  attachmentName?: string | null;
  /** The latest message was deleted — preview shows "Message deleted". */
  deleted?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  description?: string;
  unread_count?: number;
  member_count?: number | null;
  active_call?: { jitsi_room: string } | null;
  createdAt?: string | null;
  /** Channel creator; for group channels they can moderate messages. */
  createdBy?: string | null;
  isArchived?: boolean;
  /** When the current user last read this conversation (server-provided). */
  lastReadAt?: string | null;
  lastMessage?: ChannelLastMessage | null;
  otherUser?: {
    id: string;
    name: string;
    role: string | null;
    onlineAt: string | null;
    lastReadAt: string | null;
  } | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  content: string;
  thread_parent_id?: string | null;
  thread_count?: number;
  created_at: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  reactions?: Reaction[];
  isEdited?: boolean;
  editedAt?: string | null;
  /** Soft-deleted: rendered as a "Message deleted" placeholder. */
  deleted?: boolean;
  deletedAt?: string | null;
  sender: {
    id: string;
    name: string;
    avatar_url?: string | null;
    online_at?: string | null;
  };
  /** Client-only: not yet confirmed by the server. */
  _optimistic?: boolean;
  /** Client-only: optimistic attachment still uploading. */
  _uploading?: boolean;
  /** Client-only: 0–100 upload progress for an optimistic attachment. */
  _progress?: number;
  /** Client-only: the send failed and can be retried. */
  _failed?: string | null;
  /** Client-only: object URL preview for an uploading image. */
  _previewUrl?: string | null;
}

export interface IncomingCall {
  id: string;
  jitsiRoom: string;
  channelId: string;
  channelName: string;
}

export type ActiveCall = IncomingCall;

export interface PersonResult {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  internal_email?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  unique_student_id?: string | null;
}
