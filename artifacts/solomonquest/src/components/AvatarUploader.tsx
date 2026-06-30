import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Avatar from "@/components/Avatar";

const DEFAULT_AVATARS = ["🦁", "🐻", "🦊", "🐼", "🦋", "🌟", "🎯", "🚀"];

const BG_COLORS = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-pink-500",
  "bg-teal-500",
];

interface AvatarUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  onSaved?: () => void;
}

export default function AvatarUploader({ open, onOpenChange, user, onSaved }: AvatarUploaderProps) {
  const [selectedDefaultIndex, setSelectedDefaultIndex] = useState<number | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUser = (): { first_name?: string; last_name?: string; avatar_url?: string } => {
    if (selectedDefaultIndex !== null) {
      return { ...user, avatar_url: `default:${selectedDefaultIndex}` };
    }
    if (previewUrl) {
      return { ...user, avatar_url: previewUrl };
    }
    return user ?? {};
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      let body: Record<string, unknown>;

      if (selectedDefaultIndex !== null) {
        body = { avatar_type: "default", avatar_index: selectedDefaultIndex };
      } else if (customUrl.trim()) {
        body = { avatar_url: customUrl.trim() };
      } else {
        setError("Please select a default avatar or enter an image URL.");
        setIsSaving(false);
        return;
      }

      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to save avatar");
      }

      onOpenChange(false);
      if (onSaved) {
        onSaved();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Profile Picture</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-2">
          {/* Current / preview avatar */}
          <Avatar user={previewUser()} size="xl" />

          {/* Default avatar grid */}
          <div className="w-full">
            <p className="text-sm font-medium text-gray-700 mb-2">Choose a Default Avatar</p>
            <div className="grid grid-cols-4 gap-3">
              {DEFAULT_AVATARS.map((emoji, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedDefaultIndex(idx);
                    setCustomUrl("");
                    setPreviewUrl("");
                  }}
                  className={`flex items-center justify-center rounded-full text-2xl w-14 h-14 mx-auto transition-all
                    ${BG_COLORS[idx]}
                    ${selectedDefaultIndex === idx
                      ? "ring-4 ring-indigo-500 ring-offset-2 scale-110"
                      : "opacity-80 hover:opacity-100 hover:scale-105"
                    }`}
                  aria-label={`Default avatar ${idx + 1}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Custom image URL */}
          <div className="w-full">
            <p className="text-sm font-medium text-gray-700 mb-1">Custom Image URL</p>
            <p className="text-xs text-gray-500 mb-2">
              Upload your image to Supabase Storage and paste the public URL here.
            </p>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://..."
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  setSelectedDefaultIndex(null);
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewUrl(customUrl.trim())}
                disabled={!customUrl.trim()}
              >
                Preview
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 w-full">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
