import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetMySchool } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Settings,
  CheckSquare,
  FolderOpen,
  Menu,
  LogOut,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter, HelpButton } from "@/components/help/HelpCenter";

const adminLinks = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help Center", icon: HelpCircle },
];

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function NavLinks({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {adminLinks.map((link) => {
        const Icon = link.icon;
        const isActive =
          link.href === "/dashboard/admin"
            ? location === "/dashboard/admin"
            : location.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href}>
            <button
              onClick={onClose}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{link.label}</span>
              {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-70" />}
            </button>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: school } = useGetMySchool({ query: { enabled: !!user?.schoolId } });
  const { showTour, launchTour, closeTour } = useTour(user?.role as "admin" | "super_admin");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-slate-900 h-screen sticky top-0 shrink-0">
        {/* Logo / School Name */}
        <div className="px-4 py-5 border-b border-white/10">
          <Link href="/dashboard/admin">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                {(school?.name || "S")[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-white font-semibold text-sm truncate leading-tight">
                  {school?.name || "SolomonQuest"}
                </p>
                <p className="text-slate-400 text-xs">Admin Panel</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <Avatar className="h-8 w-8 border border-white/20">
              <AvatarImage src={user?.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-white text-sm font-medium truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-slate-400 text-xs capitalize truncate">
                {user?.role?.replace("_", " ")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-400/10"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </Button>
          <p className="text-center text-[10px] text-slate-600 tracking-widest uppercase mt-2">Powered by TIBLOGICS</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b flex items-center px-4 gap-3 sticky top-0 z-20 shadow-sm">
          {/* Mobile menu trigger */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-slate-900 border-r-0">
              <div className="px-4 py-5 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                    {(school?.name || "S")[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-white font-semibold text-sm truncate">
                      {school?.name || "SolomonQuest"}
                    </p>
                    <p className="text-slate-400 text-xs">Admin Panel</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <NavLinks onClose={() => setIsMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="md:hidden font-semibold text-gray-900 truncate">
            {school?.name || "SolomonQuest"}
          </div>

          <div className="hidden md:block flex-1" />

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatarUrl || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(user?.firstName, user?.lastName)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-gray-800">
                {user?.firstName} {user?.lastName}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {/* Floating help button */}
      <HelpButton onClick={() => setHelpOpen(true)} />

      {/* Help Center drawer */}
      {helpOpen && (
        <HelpCenter
          role={user?.role as "admin" | "super_admin"}
          onClose={() => setHelpOpen(false)}
          onStartTour={launchTour}
        />
      )}

      {/* Guided tour */}
      {showTour && (
        <TourOverlay role={user?.role as "admin" | "super_admin"} onClose={closeTour} />
      )}
    </div>
  );
}
