import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetMySchool,
  useUpdateSchool,
  getGetMySchoolQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Settings,
  Loader2,
  Building2,
  Shield,
  FileText,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ─── General School Settings Tab ─────────────────────────────────────────────

function SchoolSettingsTab() {
  const queryClient = useQueryClient();
  const { data: school, isLoading } = useGetMySchool();
  const updateSchool = useUpdateSchool();

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    description: "",
  });

  useEffect(() => {
    if (school) {
      setForm({
        name: school.name || "",
        logoUrl: (school as any).logoUrl || "",
        description: (school as any).description || "",
      });
    }
  }, [school]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    if (!school) return;
    if (!form.name.trim()) { toast.error("School name is required"); return; }
    updateSchool.mutate(
      {
        id: school.id,
        data: {
          name: form.name,
          logoUrl: form.logoUrl || undefined,
          description: form.description || undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Settings saved");
          queryClient.invalidateQueries({ queryKey: getGetMySchoolQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to save settings"),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">School Identity</CardTitle>
          <CardDescription>Basic information about your school</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>School Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Westfield Academy"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Logo URL</Label>
            <Input
              value={form.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            {form.logoUrl && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={form.logoUrl}
                  alt="School logo"
                  className="h-12 w-12 rounded-lg object-contain border bg-gray-50"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <p className="text-xs text-muted-foreground">Logo preview</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="A brief description of your school..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateSchool.isPending}>
        {updateSchool.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save Changes
      </Button>
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

const ROLES = [
  { key: "teacher", label: "Teacher permissions" },
  { key: "student", label: "Student permissions" },
  { key: "staff", label: "Staff permissions" },
] as const;

const FEATURES = [
  { key: "chat", label: "Chat" },
  { key: "forum", label: "Forum" },
  { key: "quizzes", label: "Quizzes" },
  { key: "resources", label: "Resources" },
  { key: "video", label: "Video Lessons" },
  { key: "assignments", label: "Assignments" },
  { key: "announcements", label: "Announcements" },
  { key: "grades", label: "Grades" },
  { key: "applications", label: "Applications" },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];
type FeatureKey = (typeof FEATURES)[number]["key"];
type PermissionMatrix = Record<RoleKey, Record<FeatureKey, boolean>>;

const DEFAULT_PERMS: PermissionMatrix = {
  teacher: { chat: true, forum: true, quizzes: true, resources: true, video: true, assignments: true, announcements: true, grades: true, applications: true },
  student: { chat: true, forum: true, quizzes: true, resources: true, video: true, assignments: true, announcements: false, grades: true, applications: false },
  staff: { chat: false, forum: true, quizzes: false, resources: true, video: false, assignments: false, announcements: true, grades: false, applications: true },
};

function PermissionsTab() {
  const { data: school } = useGetMySchool();
  const schoolId = school?.id;

  const [perms, setPerms] = useState<PermissionMatrix>(DEFAULT_PERMS);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // Load permissions from API
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    fetch(`/api/permissions?school_id=${schoolId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") {
          setPerms((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {/* use defaults silently */})
      .finally(() => setLoading(false));
  }, [schoolId]);

  const toggle = useCallback(async (role: RoleKey, feature: FeatureKey) => {
    const newValue = !perms[role]?.[feature];
    // Optimistic update
    setPerms((p) => ({
      ...p,
      [role]: { ...p[role], [feature]: newValue },
    }));
    const key = `${role}:${feature}`;
    setToggling(key);
    try {
      const res = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, role, feature, enabled: newValue }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Rollback on error
      setPerms((p) => ({
        ...p,
        [role]: { ...p[role], [feature]: !newValue },
      }));
      toast.error("Failed to update permission");
    } finally {
      setToggling(null);
    }
  }, [perms, schoolId]);

  return (
    <div className="max-w-3xl space-y-6">
      <Tabs defaultValue="teacher">
        <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
          {ROLES.map((role) => (
            <TabsTrigger
              key={role.key}
              value={role.key}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-medium"
            >
              {role.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ROLES.map((role) => (
          <TabsContent key={role.key} value={role.key} className="mt-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base capitalize">{role.label}</CardTitle>
                <CardDescription>
                  Toggle features on or off for {role.key}s. Changes take effect immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {FEATURES.map((f) => (
                      <div key={f.key} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-6 w-10 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y">
                    {FEATURES.map((feature) => {
                      const key = `${role.key}:${feature.key}`;
                      const isToggling = toggling === key;
                      return (
                        <div key={feature.key} className="flex items-center justify-between py-3.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{feature.label}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            <Switch
                              checked={perms[role.key]?.[feature.key] ?? false}
                              onCheckedChange={() => toggle(role.key, feature.key)}
                              disabled={isToggling}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Application Form Tab ─────────────────────────────────────────────────────

type FieldType = "text" | "paragraph" | "dropdown" | "checkbox" | "date" | "file" | "number";

interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // for dropdown
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short Text",
  paragraph: "Paragraph",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  date: "Date",
  file: "File Upload",
  number: "Number",
};

const DEFAULT_FIELDS: FormField[] = [
  { id: "1", label: "Full Name", type: "text", required: true },
  { id: "2", label: "Email Address", type: "text", required: true },
  { id: "3", label: "Why do you want to join?", type: "paragraph", required: true },
];

function ApplicationFormTab() {
  const { data: school } = useGetMySchool();
  const schoolId = school?.id;

  const [fields, setFields] = useState<FormField[]>(DEFAULT_FIELDS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing schema
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    fetch(`/api/form-builder/schema?school_id=${schoolId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.fields) && data.fields.length > 0) {
          setFields(data.fields);
        }
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, [schoolId]);

  const addField = () => {
    const newField: FormField = {
      id: Date.now().toString(),
      label: "New Field",
      type: "text",
      required: false,
    };
    setFields((f) => [...f, newField]);
  };

  const removeField = (id: string) => setFields((f) => f.filter((field) => field.id !== id));

  const updateField = <K extends keyof FormField>(id: string, key: K, value: FormField[K]) => {
    setFields((f) => f.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const next = direction === "up" ? index - 1 : index + 1;
    if (next < 0 || next >= fields.length) return;
    setFields((f) => {
      const arr = [...f];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  };

  const updateOptions = (id: string, raw: string) => {
    const options = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    updateField(id, "options", options);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/form-builder/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, fields }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Application form saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save form");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Application Form Builder</CardTitle>
              <CardDescription>Configure the fields applicants fill out when applying</CardDescription>
            </div>
            <Button size="sm" onClick={addField}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No fields yet. Click "Add Field" to start building your form.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-start gap-3 p-4 rounded-xl border bg-gray-50/50"
                >
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-gray-700"
                      onClick={() => moveField(index, "up")}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-gray-700"
                      onClick={() => moveField(index, "down")}
                      disabled={index === fields.length - 1}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Field Label</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(field.id, "label", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Field Type</Label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, "type", e.target.value as FieldType)}
                          className="w-full h-8 rounded-md border border-input bg-white px-2 text-sm"
                        >
                          {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {field.type === "dropdown" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Options (one per line)</Label>
                        <Textarea
                          value={(field.options || []).join("\n")}
                          onChange={(e) => updateOptions(field.id, e.target.value)}
                          placeholder={"Option A\nOption B\nOption C"}
                          rows={3}
                          className="text-sm"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.required}
                        onCheckedChange={(v) => updateField(field.id, "required", v)}
                        className="scale-75"
                      />
                      <Label className="text-xs text-muted-foreground cursor-pointer">
                        Required field
                      </Label>
                      {field.required && (
                        <Badge className="text-xs bg-red-50 text-red-600 border-red-200 border">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 mt-0.5"
                    onClick={() => removeField(field.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Form
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-muted-foreground mt-0.5">
            Configure your school's settings, permissions, and application form.
          </p>
        </div>

        <Tabs defaultValue="school">
          <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
            {[
              { value: "school", label: "School Settings", icon: Building2 },
              { value: "permissions", label: "Role Permissions", icon: Shield },
              { value: "form", label: "Application Form", icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-medium"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="school" className="mt-6">
            <SchoolSettingsTab />
          </TabsContent>
          <TabsContent value="permissions" className="mt-6">
            <PermissionsTab />
          </TabsContent>
          <TabsContent value="form" className="mt-6">
            <ApplicationFormTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
