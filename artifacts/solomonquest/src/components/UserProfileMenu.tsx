import { useState } from "react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Avatar from "@/components/Avatar";
import AvatarUploader from "@/components/AvatarUploader";
import { useAuth } from "@/contexts/AuthContext";

export default function UserProfileMenu() {
  const { user, signOut } = useAuth();
  const [uploaderOpen, setUploaderOpen] = useState(false);

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";

  const avatarUser = user
    ? {
        first_name: user.firstName ?? undefined,
        last_name: user.lastName ?? undefined,
        avatar_url: user.avatarUrl ?? undefined,
      }
    : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            aria-label="User menu"
          >
            <Avatar user={avatarUser} size="md" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          {/* User info header */}
          <DropdownMenuLabel className="flex items-center gap-3 py-3">
            <Avatar user={avatarUser} size="md" />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm truncate">{fullName}</span>
              {user?.role && (
                <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
              )}
              {user?.role === "student" && (user as { uniqueStudentId?: string }).uniqueStudentId && (
                <span className="text-xs text-muted-foreground font-mono">
                  ID: {(user as { uniqueStudentId?: string }).uniqueStudentId}
                </span>
              )}
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setUploaderOpen(true)}
            className="cursor-pointer"
          >
            Edit Profile
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/settings/notifications" className="cursor-pointer w-full">
              Notification Preferences
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => signOut()}
            className="cursor-pointer text-red-600 focus:text-red-600"
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AvatarUploader
        open={uploaderOpen}
        onOpenChange={setUploaderOpen}
        user={avatarUser}
        onSaved={() => window.location.reload()}
      />
    </>
  );
}
