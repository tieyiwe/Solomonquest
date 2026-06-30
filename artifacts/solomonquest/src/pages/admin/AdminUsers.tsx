import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListUsers,
  useUpdateUserRole,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search,
  UserPlus,
  KeyRound,
  Mail,
  Loader2,
  Users,
  GraduationCap,
  Briefcase,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function roleBadge(role?: string | null) {
  switch (role) {
    case "admin":
    case "super_admin":
      return <Badge className="bg-violet-100 text-violet-700 border-violet-200 border">{role?.replace("_", " ")}</Badge>;
    case "teacher":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">Teacher</Badge>;
    case "student":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Student</Badge>;
    case "staff":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200 border">Staff</Badge>;
    default:
      return <Badge variant="outline" className="capitalize">{role || "No role"}</Badge>;
  }
}

function PasswordResetButton({ userId, userName }: { userId: string; userName: string }) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to send reset email");
      toast.success(`Password reset email sent to ${userName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-gray-900">
          <KeyRound className="h-3.5 w-3.5 mr-1.5" />
          Reset Password
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Password Reset?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a password reset email to <strong>{userName}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Reset Email
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UserTable({
  role,
  search,
}: {
  role?: string;
  search: string;
}) {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers(role ? { role } : undefined);
  const updateUserRole = useUpdateUserRole();

  const filtered = (users ?? []).filter((u) => {
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    updateUserRole.mutate(
      { id: userId, data: { role: newRole } },
      {
        onSuccess: () => {
          toast.success("Role updated");
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to update role"),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">{search ? "No users match your search." : "No users found."}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-50/50">
          <TableHead className="font-semibold">Name</TableHead>
          <TableHead className="font-semibold">Email</TableHead>
          <TableHead className="font-semibold">Role</TableHead>
          <TableHead className="font-semibold">Change Role</TableHead>
          <TableHead className="font-semibold">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((user) => (
          <TableRow key={user.id} className="hover:bg-gray-50/50">
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 border">
                  <AvatarImage src={user.avatarUrl || ""} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                    {getInitials(user.firstName, user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-gray-900 text-sm">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
            <TableCell>{roleBadge(user.role)}</TableCell>
            <TableCell>
              <Select
                defaultValue={user.role || ""}
                onValueChange={(val) => handleRoleChange(user.id, val)}
                disabled={updateUserRole.isPending}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <PasswordResetButton
                userId={user.id}
                userName={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "User"}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InvitationsTab() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<Array<{ email: string; sentAt: string }>>([]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: email.trim(), role: "teacher" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send invitation");
      }
      setPendingInvites((prev) => [
        { email: email.trim(), sentAt: new Date().toISOString() },
        ...prev,
      ]);
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setInviteOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between p-4 border-b">
        <p className="text-sm text-muted-foreground">
          Invite teachers by email. They'll receive a link to set up their account.
        </p>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Teacher
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Teacher</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="teacher@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The invited person will receive an email to join your school as a teacher.
              </p>
              <Button
                className="w-full"
                onClick={handleInvite}
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Invitation
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {pendingInvites.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No pending invitations. Invite a teacher to get started.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Sent</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingInvites.map((inv, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-sm">{inv.email}</TableCell>
                <TableCell>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">Teacher</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(inv.sentAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50">
                    Pending
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("teachers");

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">User Management</h1>
            <p className="text-muted-foreground mt-0.5">
              Manage all users, roles, and invitations.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
            {[
              { value: "teachers", label: "Teachers", icon: Users },
              { value: "students", label: "Students", icon: GraduationCap },
              { value: "staff", label: "Staff", icon: Briefcase },
              { value: "invitations", label: "Invitations", icon: Mail },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-medium"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="teachers" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <UserTable role="teacher" search={search} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <UserTable role="student" search={search} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <UserTable role="staff" search={search} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invitations" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <InvitationsTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
