import { ReactNode } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import MobileNav from "./MobileNav";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  sidebar?: ReactNode;
}

export default function AppShell({ children, title, sidebar }: AppShellProps) {
  const { user } = useAuth();

  const initials =
    user
      ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?"
      : "?";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile header — only visible on mobile */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-background border-b border-border h-14 flex items-center px-4 gap-3">
        <Link href="/">
          <a className="flex flex-col leading-tight mr-auto">
            <span className="text-base font-bold text-primary">SolomonQuest</span>
            <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Powered by TIBLOGICS</span>
          </a>
        </Link>

        {title && (
          <span className="text-sm font-semibold text-foreground truncate max-w-[140px]">
            {title}
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="icon" className="relative h-9 w-9" asChild>
            <Link href="/notifications">
              <a>
                <Bell className="h-5 w-5" />
                <span className="sr-only">Notifications</span>
              </a>
            </Link>
          </Button>

          <Link href="/profile">
            <a className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
              {initials}
            </a>
          </Link>
        </div>
      </header>

      {/* Desktop layout */}
      <div className="flex flex-1 md:pt-0 pt-14">
        {/* Desktop sidebar */}
        {sidebar && (
          <aside className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-border bg-background fixed top-0 bottom-0 left-0 z-30">
            {sidebar}
          </aside>
        )}

        {/* Main content */}
        <main
          className={`flex-1 min-w-0 pb-20 md:pb-0 ${sidebar ? "md:ml-60" : ""}`}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}
