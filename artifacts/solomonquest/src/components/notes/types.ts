export interface Note {
  id: string;
  owner_id: string;
  title: string | null;
  content: string;
  color: string;
  is_sticky: boolean;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  permission: "owner" | "edit" | "view";
  shared: boolean;
  shareCount?: number;
}

export const NOTE_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff"];
