import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter, HelpButton } from "@/components/help/HelpCenter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Menu, LogOut, LayoutDashboard, Users, BookOpen, Settings, CheckSquare, GraduationCap, ClipboardList, FolderOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetMySchool } from "@workspace/api-client-react";
import { BottomNav } from "@/components/layout/BottomNav";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { showTour, launchTour, closeTour } = useTour(user?.role as "student" | "staff" | null);

  const { data: school } = useGetMySchool({
    query: {
      enabled: !!user?.schoolId,
    },
  });

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
  };

  const adminLinks = [
    { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/admin/users", label: "Users", icon: Users },
    { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
    { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
    { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
    { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  ];

  const teacherLinks = [
    { href: "/dashboard/teacher", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: ClipboardList },
  ];

  const studentLinks = [
    { href: "/dashboard/student", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/student/assignments", label: "Assignments", icon: CheckSquare },
  ];

  const getLinks = () => {
    if (user?.role === "admin" || user?.role === "super_admin") return adminLinks;
    if (user?.role === "teacher") return teacherLinks;
    return studentLinks;
  };

  const links = getLinks();

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 p-3">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = location === link.href || location.startsWith(`${link.href}/`);
        return (
          <Button
            key={link.href}
            variant="ghost"
            className={`justify-start ${isActive ? "bg-white/15 text-white font-semibold hover:bg-white/20 hover:text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            asChild
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <Link href={link.href}>
              <Icon className="mr-2 h-4 w-4" />
              {link.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 h-screen sticky top-0">
        <div className="p-6 border-b border-white/10 h-16 flex items-center">
          <Link href="/">
            <h1 className="text-xl font-bold text-white tracking-tight truncate">
              {school?.name || "SolomonQuest"}
            </h1>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="h-9 w-9 border border-white/20">
              <AvatarImage src={user?.avatarUrl || ""} />
              <AvatarFallback className="bg-white/20 text-white">{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</span>
              <span className="text-xs text-white/50 capitalize truncate">{user?.role?.replace("_", " ")}</span>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-white/60 hover:text-red-400 hover:bg-red-500/10" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
          <p className="text-center text-[10px] text-white/20 tracking-widest uppercase mt-2">Powered by TIBLOGICS</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header & Top Bar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-slate-900 border-r border-slate-700">
                <div className="p-6 border-b border-white/10 h-16 flex items-center">
                  <h1 className="text-xl font-bold text-white tracking-tight truncate">
                    {school?.name || "SolomonQuest"}
                  </h1>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-bold text-primary truncate">{school?.name || "SolomonQuest"}</span>
          </div>
          
          <div className="hidden md:flex font-semibold text-foreground">
            Dashboard
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="icon" className="rounded-full">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </Button>
            <div className="md:hidden">
              <Avatar className="h-8 w-8 border">
                <AvatarImage src={user?.avatarUrl || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-background has-bottom-nav md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav links={links} onItemClick={() => setIsMobileMenuOpen(false)} />

      <HelpButton onClick={() => setHelpOpen(true)} />
      {helpOpen && (
        <HelpCenter
          role={user?.role as "student" | "staff"}
          onClose={() => setHelpOpen(false)}
          onStartTour={launchTour}
        />
      )}
      {showTour && (
        <TourOverlay role={user?.role as "student" | "staff"} onClose={closeTour} />
      )}
    </div>
  );
}
