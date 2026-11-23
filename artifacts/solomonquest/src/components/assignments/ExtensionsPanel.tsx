import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface StudentExtension {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string | null;
  extendedDueAt: string;
  waivePenalty: boolean;
  reason: string | null;
}

interface ExtensionsResponse {
  available: boolean;
  extensions: StudentExtension[];
  students: { studentId: string; studentName: string }[];
}

async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/** Local "yyyy-MM-ddTHH:mm" for a datetime-local input. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Teacher UI for per-student extensions on one assignment: pick a student,
 * a new due date, optionally waive the late penalty. Shown inside the
 * assignment's submissions panel.
 */
export function ExtensionsPanel({
  assignmentId,
  dueDate,
  onChanged,
}: {
  assignmentId: string;
  dueDate?: string | null;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<ExtensionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [when, setWhen] = useState("");
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/assignments/${assignmentId}/extensions`));
    } catch (err: any) {
      toast.error(err.message || "Could not load extensions");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (ext: StudentExtension) => {
    setStudentId(ext.studentId);
    setWhen(toLocalInput(ext.extendedDueAt));
    setWaive(ext.waivePenalty);
    setReason(ext.reason ?? "");
  };

  const save = async () => {
    if (!studentId) {
      toast.error("Choose a student");
      return;
    }
    if (!when || isNaN(Date.parse(when))) {
      toast.error("Choose a new due date");
      return;
    }
    setSaving(true);
    try {
      await api(`/assignments/${assignmentId}/extensions/${studentId}`, {
        method: "PUT",
        body: JSON.stringify({ extendedDueAt: new Date(when).toISOString(), waivePenalty: waive, reason: reason || null }),
      });
      toast.success("Extension saved");
      setStudentId("");
      setWhen("");
      setWaive(false);
      setReason("");
      await load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not save extension");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ext: StudentExtension) => {
    try {
      await api(`/assignments/${assignmentId}/extensions/${ext.studentId}`, { method: "DELETE" });
      toast.success("Extension removed");
      await load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not remove extension");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3" data-testid="extensions-panel">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Extensions</p>
        {dueDate && (
          <span className="text-xs text-muted-foreground ml-auto">
            Class due date {format(new Date(dueDate), "MMM d, h:mm a")}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : data && !data.available ? (
        <p className="text-xs text-muted-foreground">
          Extensions need the late-work database update (late-work-and-alerts.sql) to be applied.
        </p>
      ) : (
        <>
          {data && data.extensions.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {data.extensions.map((ext) => (
                <li key={ext.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{ext.studentName ?? "Student"}</span>
                  <span className="text-xs text-muted-foreground">
                    due {format(new Date(ext.extendedDueAt), "MMM d, yyyy h:mm a")}
                  </span>
                  {ext.waivePenalty && (
                    <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                      Penalty waived
                    </Badge>
                  )}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startEdit(ext)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      aria-label={`Remove extension for ${ext.studentName ?? "student"}`}
                      onClick={() => remove(ext)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No extensions granted.</p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="h-8 text-xs" aria-label="Student">
                  <SelectValue placeholder="Choose a student" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.students ?? []).map((s) => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.studentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ext-when-${assignmentId}`} className="text-xs">New due date</Label>
              <Input
                id={`ext-when-${assignmentId}`}
                type="datetime-local"
                className="h-8 text-xs"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`ext-reason-${assignmentId}`} className="text-xs">Reason (optional, private)</Label>
              <Input
                id={`ext-reason-${assignmentId}`}
                className="h-8 text-xs"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id={`ext-waive-${assignmentId}`} checked={waive} onCheckedChange={setWaive} />
              <Label htmlFor={`ext-waive-${assignmentId}`} className="text-xs">Waive late penalty</Label>
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="h-8" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Save extension
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
