import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, BookOpen, Star, FileText, Users } from "lucide-react";

interface NotificationPrefs {
  inApp: boolean;
  email: boolean;
  chatMessages: boolean;
  forumActivity: boolean;
  assignmentUpdates: boolean;
  gradeNotifications: boolean;
  newResources: boolean;
  applicationStatusUpdates: boolean;
}

const defaultPrefs: NotificationPrefs = {
  inApp: true,
  email: true,
  chatMessages: true,
  forumActivity: true,
  assignmentUpdates: true,
  gradeNotifications: true,
  newResources: true,
  applicationStatusUpdates: true,
};

export default function NotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const res = await fetch("/api/users/me/notification-prefs");
        if (!res.ok) throw new Error("Failed to fetch preferences");
        const data = await res.json();
        setPrefs({ ...defaultPrefs, ...data });
      } catch {
        toast.error("Could not load notification preferences.");
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, []);

  const toggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      toast.success("Notification preferences saved.");
    } catch {
      toast.error("Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground text-sm">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notification Preferences</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Control how and when you receive notifications.
        </p>
      </div>

      {/* Master Toggles */}
      <div className="rounded-lg border bg-card p-6 mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Delivery Channels
        </h2>
        <div className="space-y-4">
          <PreferenceRow
            id="inApp"
            label="In-App Notifications"
            description="Receive notifications inside the app."
            icon={<Bell className="h-4 w-4" />}
            checked={prefs.inApp}
            onToggle={() => toggle("inApp")}
          />
          <div className="border-t" />
          <PreferenceRow
            id="email"
            label="Email Notifications"
            description="Receive notifications via email."
            icon={<Mail className="h-4 w-4" />}
            checked={prefs.email}
            onToggle={() => toggle("email")}
          />
        </div>
      </div>

      {/* Activity Toggles */}
      <div className="rounded-lg border bg-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Activity Types
        </h2>
        <div className="space-y-4">
          <PreferenceRow
            id="chatMessages"
            label="Chat Messages"
            description="Notifications for new chat messages."
            icon={<MessageSquare className="h-4 w-4" />}
            checked={prefs.chatMessages}
            onToggle={() => toggle("chatMessages")}
          />
          <div className="border-t" />
          <PreferenceRow
            id="forumActivity"
            label="Forum Activity"
            description="Comments and reactions on forum posts."
            icon={<Users className="h-4 w-4" />}
            checked={prefs.forumActivity}
            onToggle={() => toggle("forumActivity")}
          />
          <div className="border-t" />
          <PreferenceRow
            id="assignmentUpdates"
            label="Assignment Updates"
            description="Notifications about assignment changes and deadlines."
            icon={<FileText className="h-4 w-4" />}
            checked={prefs.assignmentUpdates}
            onToggle={() => toggle("assignmentUpdates")}
          />
          <div className="border-t" />
          <PreferenceRow
            id="gradeNotifications"
            label="Grade Notifications"
            description="Alerts when grades or feedback are posted."
            icon={<Star className="h-4 w-4" />}
            checked={prefs.gradeNotifications}
            onToggle={() => toggle("gradeNotifications")}
          />
          <div className="border-t" />
          <PreferenceRow
            id="newResources"
            label="New Resources"
            description="Notifications when new learning resources are added."
            icon={<BookOpen className="h-4 w-4" />}
            checked={prefs.newResources}
            onToggle={() => toggle("newResources")}
          />
          <div className="border-t" />
          <PreferenceRow
            id="applicationStatusUpdates"
            label="Application Status Updates"
            description="Updates on the status of your applications."
            icon={<Bell className="h-4 w-4" />}
            checked={prefs.applicationStatusUpdates}
            onToggle={() => toggle("applicationStatusUpdates")}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}

interface PreferenceRowProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}

function PreferenceRow({ id, label, description, icon, checked, onToggle }: PreferenceRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}
