import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { notesAuthedFetch } from "./NotesContext";

interface ShareEntry {
  id: string;
  userId: string;
  permission: "view" | "edit";
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface SearchUser {
  id: string;
  first_name: string;
  last_name: string;
  internal_email: string;
  role: string;
}

export function ShareNoteDialog({
  noteId,
  open,
  onOpenChange,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notesAuthedFetch(`/api/notes/${noteId}/shares`)
      .then((r) => r.json())
      .then((data) => setShares(data.shares ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, noteId]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      notesAuthedFetch(`/api/users/search?query=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const alreadyShared = new Set(shares.map((s) => s.userId));

  const handleShare = async (userId: string) => {
    try {
      const res = await notesAuthedFetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, permission: "view" }),
      });
      if (!res.ok) throw new Error("Failed to share");
      const target = results.find((r) => r.id === userId);
      if (target) {
        setShares((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            userId,
            permission: "view",
            firstName: target.first_name,
            lastName: target.last_name,
            email: target.internal_email,
          },
        ]);
      }
      setQuery("");
      setResults([]);
      toast.success("Note shared");
    } catch {
      toast.error("Failed to share note");
    }
  };

  const handleUnshare = async (userId: string) => {
    setShares((prev) => prev.filter((s) => s.userId !== userId));
    await notesAuthedFetch(`/api/notes/${noteId}/share/${userId}`, { method: "DELETE" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Note</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
          {results.length > 0 && (
            <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
              {results
                .filter((r) => !alreadyShared.has(r.id))
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleShare(r.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>
                      {r.first_name} {r.last_name}{" "}
                      <span className="text-muted-foreground">({r.role})</span>
                    </span>
                    <span className="text-xs text-primary">Share</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Shared with
          </p>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
          ) : (
            <div className="space-y-1.5">
              {shares.map((s) => (
                <div key={s.userId} className="flex items-center justify-between text-sm">
                  <span>
                    {s.firstName} {s.lastName}
                    <Badge variant="outline" className="ml-2 text-[10px] capitalize">
                      {s.permission}
                    </Badge>
                  </span>
                  <button
                    onClick={() => handleUnshare(s.userId)}
                    className="text-muted-foreground hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
