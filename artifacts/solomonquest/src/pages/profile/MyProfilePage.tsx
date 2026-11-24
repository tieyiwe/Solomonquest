import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { RoleLayout } from "@/components/layout/RoleLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Camera, KeyRound, Loader2, Mail, Save } from "lucide-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function roleLabel(role?: string | null) {
  if (!role) return "";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Signed-in password change. The only other password UI is the email
 * recovery flow (/auth/reset-password), which needs a recovery link — a
 * logged-in user had no way to change their password. The current password
 * is re-verified first so an unattended session can't be used to take over
 * the account.
 */
function ChangePasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (!email) {
      toast.error("Your account has no email address to verify against");
      return;
    }
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) throw new Error("Current password is incorrect");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
        <CardDescription>Use at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="myprofilepage-current-password">Current password</Label>
          <Input id="myprofilepage-current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-new-password">New password</Label>
            <Input id="myprofilepage-new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-confirm-password">Confirm new password</Label>
            <Input id="myprofilepage-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleChange} disabled={saving || !current || !next || !confirm}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
          Change Password
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Signed-in email change. Safety rests on three things:
 *  - the current password is re-checked first, so an unattended session
 *    can't redirect the account's email (the usual first step of a takeover);
 *  - Supabase Auth only switches the email after the confirmation link is
 *    clicked. With "Secure email change" on (the Supabase default), links go
 *    to BOTH the old and new addresses and both must be confirmed, so the
 *    real owner is told and can refuse;
 *  - profiles.email is synced from auth.users by a database trigger
 *    (supabase-perf-denormalize-email.sql), so nothing here writes it.
 */
function ChangeEmailCard({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [nextEmail, setNextEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const pending = (data.user as { new_email?: string | null } | null)?.new_email;
      setPendingEmail(pending || null);
    });
    // After a confirmation link, Supabase returns here with a status message
    // in the URL fragment (e.g. "confirm the link sent to the other email").
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const message = hash.get("message");
    const errorDescription = hash.get("error_description");
    if (message) toast.info(message.replace(/\+/g, " "));
    if (errorDescription) toast.error(errorDescription.replace(/\+/g, " "));
    if (message || errorDescription) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const handleChange = async () => {
    const target = nextEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (target === email.trim().toLowerCase()) {
      toast.error("That is already your email address");
      return;
    }
    if (!email) {
      toast.error("Your account has no email address to verify against");
      return;
    }
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password });
      if (verifyError) throw new Error("Password is incorrect");
      const { error } = await supabase.auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/profile` }
      );
      if (error) throw error;
      setPendingEmail(target);
      setPassword("");
      setNextEmail("");
      toast.success("Check your inbox to confirm the change");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change email");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change Email</CardTitle>
        <CardDescription>
          You sign in with this address. We'll send confirmation links before anything changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingEmail && (
          <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
            Change to <span className="font-medium">{pendingEmail}</span> is waiting for confirmation.
            Open the links sent to <span className="font-medium">{email}</span> and{" "}
            <span className="font-medium">{pendingEmail}</span>. Until then, keep signing in with your current email.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-new-email">New email</Label>
            <Input id="myprofilepage-new-email" type="email" autoComplete="email" value={nextEmail} onChange={(e) => setNextEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-email-password">Current password</Label>
            <Input id="myprofilepage-email-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleChange} disabled={saving || !password || !nextEmail}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Change Email
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    authedFetch(`/api/users/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setFirstName(data.firstName ?? data.first_name ?? "");
        setLastName(data.lastName ?? data.last_name ?? "");
        setBio(data.bio ?? "");
        setPhone(data.phone ?? "");
        setAvatarUrl(data.avatarUrl ?? data.avatar_url ?? "");
        setEmail(data.email ?? "");
      })
      .catch(() => toast.error("Failed to load your profile"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `avatars/${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("school-assets")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("school-assets").getPublicUrl(path);
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;

      const res = await authedFetch("/api/users/me/avatar", {
        method: "POST",
        body: JSON.stringify({ avatar_url: versionedUrl }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");

      setAvatarUrl(versionedUrl);
      // The header/sidebar avatar comes from the cached /auth/me profile.
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success("Profile picture updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to upload picture");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName, bio, phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      // Refresh the signed-in profile so the name in the header, sidebar
      // and profile menu updates without a reload.
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "User";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-0.5">Manage your personal information and profile picture.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Picture</CardTitle>
          <CardDescription>
            Defaults to your initials until you upload a photo (max 2 MB).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20 border-2 border-primary/20">
              <AvatarImage src={avatarUrl} alt={fullName} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {getInitials(firstName, lastName)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 disabled:opacity-60"
              title="Change profile picture"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFile}
            />
          </div>
          <div>
            <p className="font-semibold text-foreground">{fullName}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
            {user?.role && (
              <Badge variant="outline" className="mt-1 capitalize">{roleLabel(user.role)}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="myprofilepage-first-name">First Name</Label>
              <Input id="myprofilepage-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="myprofilepage-last-name">Last Name</Label>
              <Input id="myprofilepage-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-email">Email</Label>
            <Input id="myprofilepage-email" value={email} readOnly disabled className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-phone">Phone</Label>
            <Input id="myprofilepage-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="myprofilepage-bio">Bio</Label>
            <Textarea id="myprofilepage-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell us a little about yourself..."
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <ChangeEmailCard email={user?.email || email || ""} />
      <ChangePasswordCard email={email || user?.email || ""} />
    </div>
  );
}

export default function MyProfilePage() {
  return (
    <RoleLayout>
      <ProfileForm />
    </RoleLayout>
  );
}
