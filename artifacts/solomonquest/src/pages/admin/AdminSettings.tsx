import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
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
  GripVertical,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ─── School Settings Tab ─────────────────────────────────────────────────────

function SchoolSettingsTab() {
  const queryClient = useQueryClient();
  const { data: school, isLoading } = useGetMySchool();
  const updateSchool = useUpdateSchool();

  const [form, setForm] = useState({
    name: "",
    slug: "",
    primaryColor: "#6366f1",
    secondaryColor: "#f59e0b",
    logoUrl: "",
  });

  useEffect(() => {
    if (school) {
      setForm({
        name: school.name || "",
        slug: school.slug || "",
        primaryColor: school.primaryColor || "#6366f1",
        secondaryColor: school.secondaryColor || "#f59e0b",
        logoUrl: school.logoUrl || "",
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
          primaryColor: form.primaryColor || undefined,
          secondaryColor: form.secondaryColor || undefined,
          logoUrl: form.logoUrl || undefined,
        },
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
        {Array.from({ length: 5 }).map((_, i) => (
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
            <Label>School Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/schools/</span>
              <Input
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="westfield-academy"
                disabled
                className="font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The slug is set during onboarding and cannot be changed here.
            </p>
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
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Brand Colors</CardTitle>
          <CardDescription>Customize your school's color scheme</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  placeholder="#6366f1"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Secondary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => set("secondaryColor", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                />
                <Input
                  value={form.secondaryColor}
                  onChange={(e) => set("secondaryColor", e.target.value)}
                  placeholder="#f59e0b"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Color preview */}
          <div className="flex gap-2 mt-2">
            <div
              className="h-8 flex-1 rounded-md"
              style={{ backgroundColor: form.primaryColor }}
            />
            <div
              className="h-8 flex-1 rounded-md"
              style={{ backgroundColor: form.secondaryColor }}
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

const ROLES = ["teacher", "student", "staff"] as const;
const FEATURES = [
  { key: "chat", label: "Chat" },
  { key: "forum", label: "Forum" },
  { key: "video", label: "Video Lessons" },
  { key: "resources", label: "Resources" },
  { key: "quizzes", label: "Quizzes" },
  { key: "assignments", label: "Assignments" },
] as const;

type PermissionMatrix = Record<string, Record<string, boolean>>;

const defaultPermissions: PermissionMatrix = {
  teacher: { chat: true, forum: true, video: true, resources: true, quizzes: true, assignments: true },
  student: { chat: true, forum: true, video: true, resources: true, quizzes: true, assignments: true },
  staff: { chat: false, forum: true, video: false, resources: true, quizzes: false, assignments: false },
};

function PermissionsTab() {
  const [perms, setPerms] = useState<PermissionMatrix>(defaultPermissions);
  const [saving, setSaving] = useState(false);

  const toggle = (role: string, feature: string) => {
    setPerms((p) => ({
      ...p,
      [role]: { ...p[role], [feature]: !p[role]?.[feature] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Permissions saved");
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Feature Access by Role</CardTitle>
          <CardDescription>
            Control which features are available for each role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-3 pr-6 text-sm font-semibold text-gray-900">
                    Feature
                  </th>
                  {ROLES.map((role) => (
                    <th
                      key={role}
                      className="text-center py-3 px-4 text-sm font-semibold text-gray-900 capitalize"
                    >
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {FEATURES.map((feature) => (
                  <tr key={feature.key} className="hover:bg-gray-50/50">
                    <td className="py-3.5 pr-6">
                      <p className="text-sm font-medium text-gray-800">{feature.label}</p>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="py-3.5 px-4 text-center">
                        <Switch
                          checked={perms[role]?.[feature.key] ?? false}
                          onCheckedChange={() => toggle(role, feature.key)}
                          className="mx-auto"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Permissions
      </Button>
    </div>
  );
}

// ─── Application Form Tab ─────────────────────────────────────────────────────

interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "select" | "checkbox";
  required: boolean;
  placeholder?: string;
}

const defaultFields: FormField[] = [
  { id: "1", label: "Full Name", type: "text", required: true, placeholder: "Enter your full name" },
  { id: "2", label: "Email Address", type: "email", required: true, placeholder: "you@example.com" },
  { id: "3", label: "Why do you want to join?", type: "textarea", required: true, placeholder: "Tell us about yourself..." },
  { id: "4", label: "Previous Education", type: "text", required: false, placeholder: "School / institution name" },
];

function ApplicationFormTab() {
  const [fields, setFields] = useState<FormField[]>(defaultFields);
  const [saving, setSaving] = useState(false);

  const addField = () => {
    const newField: FormField = {
      id: Date.now().toString(),
      label: "New Field",
      type: "text",
      required: false,
    };
    setFields((f) => [...f, newField]);
  };

  const removeField = (id: string) => {
    setFields((f) => f.filter((field) => field.id !== id));
  };

  const updateField = (id: string, key: keyof FormField, value: string | boolean) => {
    setFields((f) =>
      f.map((field) => (field.id === id ? { ...field, [key]: value } : field))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Application form saved");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Application Form Fields</CardTitle>
              <CardDescription>Configure what applicants fill out when applying</CardDescription>
            </div>
            <Button size="sm" onClick={addField}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex items-start gap-3 p-4 rounded-xl border bg-gray-50/50"
              >
                <div className="mt-2 cursor-grab text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
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
                        onChange={(e) => updateField(field.id, "type", e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-white px-2 text-sm"
                      >
                        <option value="text">Short Text</option>
                        <option value="textarea">Long Text</option>
                        <option value="email">Email</option>
                        <option value="select">Dropdown</option>
                        <option value="checkbox">Checkbox</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Placeholder (optional)</Label>
                    <Input
                      value={field.placeholder || ""}
                      onChange={(e) => updateField(field.id, "placeholder", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Hint text for this field..."
                    />
                  </div>
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
            Configure your school's settings, permissions, and forms.
          </p>
        </div>

        <Tabs defaultValue="school">
          <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
            {[
              { value: "school", label: "School Settings", icon: Building2 },
              { value: "permissions", label: "Permissions", icon: Shield },
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
