import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  BarChart2,
  Bell,
  AlertTriangle,
  MessageSquare,
  Paintbrush,
  ChevronDown,
  Layers,
  CalendarDays,
  CalendarRange,
  History,
  DollarSign,
  Wallet,
  Shield,
  Award,
  Upload,
  Library,
} from "lucide-react";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter } from "@/components/help/HelpCenter";
import { BottomNav } from "@/components/layout/BottomNav";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { AgentWidget } from "@/components/agent/AgentWidget";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";
import {
  brandMark,
  navIconActive,
  navIconIdle,
  navItemClass,
  navSectionLabel,
} from "@/components/layout/navStyles";

const adminLinks = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/tuition", label: "Tuition", icon: DollarSign },
  { href: "/dashboard/admin/accounting", label: "Accounting", icon: Wallet },
  { href: "/dashboard/admin/programs", label: "Programs", icon: Layers },
  { href: "/dashboard/admin/terms", label: "Terms & Scheduling", icon: CalendarRange },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/admin/certificates", label: "Certificates", icon: Award },
  { href: "/dashboard/admin/question-banks", label: "Question Banks", icon: Library },
  { href: "/dashboard/admin/bulk-import", label: "Bulk Import", icon: Upload },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/audit-log", label: "Audit Log", icon: History },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/help", label: "Help Center", icon: HelpCircle },
  // Settings sub-links kept here so BottomNav includes them
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/branding", label: "Branding", icon: Paintbrush },
  { href: "/dashboard/admin/danger-zone", label: "Danger Zone", icon: AlertTriangle },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
];

// Sidebar sections (display grouping only — routes and order of adminLinks are unchanged).
const NAV_GROUPS: { label: string; hrefs: string[] }[] = [
  { label: "Overview", hrefs: ["/dashboard/admin", "/calendar", "/dashboard/admin/analytics"] },
  {
    label: "Academics",
    hrefs: [
      "/dashboard/admin/users",
      "/dashboard/admin/courses",
      "/dashboard/admin/programs",
      "/dashboard/admin/terms",
      "/dashboard/admin/admissions",
      "/dashboard/admin/resources",
      "/dashboard/admin/certificates",
      "/dashboard/admin/question-banks",
    ],
  },
  { label: "Finance", hrefs: ["/dashboard/admin/tuition", "/dashboard/admin/accounting"] },
  { label: "Communication", hrefs: ["/chat", "/help"] },
  // Danger Zone lives under Settings (after Branding), not here.
  { label: "Administration", hrefs: ["/dashboard/admin/audit-log", "/dashboard/admin/bulk-import"] },
];

const settingsSubLinks = [
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/branding", label: "Branding", icon: Paintbrush },
  { href: "/dashboard/admin/danger-zone", label: "Danger Zone", icon: AlertTriangle },
];

const settingsHrefs = new Set(settingsSubLinks.map((l) => l.href));
const mainLinks = adminLinks.filter(
  (l) => l.href !== "/dashboard/admin/settings" && !settingsHrefs.has(l.href)
);

// Only the 4 most-used destinations get a bottom-nav tab of their own — the
// rest live behind "More", which opens the same drawer as the hamburger.
const bottomNavPrimaryLinks = [
  adminLinks[0], // Overview
  adminLinks[1], // Users
  adminLinks[2], // Courses
  { href: "/chat", label: "Chat", icon: MessageSquare },
];
const bottomNavPrimaryHrefs = new Set(bottomNavPrimaryLinks.map((l) => l.href));
const bottomNavOverflowLinks = adminLinks.filter((l) => !bottomNavPrimaryHrefs.has(l.href));

function NavLinks({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const isInSettings =
    location.startsWith("/dashboard/admin/settings") ||
    settingsSubLinks.some((l) => location.startsWith(l.href));

  // Submenu is open when on any settings page, OR when user manually opened it
  const [manualOpen, setManualOpen] = useState(false);
  const settingsOpen = isInSettings || manualOpen;

  const renderLink = (link: (typeof mainLinks)[number]) => {
    const Icon = link.icon;
    const isActive =
      link.href === "/dashboard/admin"
        ? location === "/dashboard/admin"
        : location.startsWith(link.href);
    return (
      <Link key={link.href} href={link.href}>
        <button
          onClick={onClose}
          aria-current={isActive ? "page" : undefined}
          className={navItemClass(isActive)}
        >
          <Icon className={isActive ? navIconActive : navIconIdle} aria-hidden="true" />
          <span className="truncate">{link.label}</span>
        </button>
      </Link>
    );
  };

  // Visual grouping only: every link in mainLinks still renders exactly once.
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.hrefs));
  const ungrouped = mainLinks.filter((l) => !grouped.has(l.href));

  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-0.5 px-3 pb-3 pt-1">
      {NAV_GROUPS.map((group) => {
        const links = group.hrefs
          .map((href) => mainLinks.find((l) => l.href === href))
          .filter((l): l is (typeof mainLinks)[number] => !!l);
        if (!links.length) return null;
        return (
          <div key={group.label} role="group" aria-label={group.label} className="flex flex-col gap-0.5">
            <p className={navSectionLabel}>{group.label}</p>
            {links.map(renderLink)}
          </div>
        );
      })}
      {ungrouped.map(renderLink)}

      {/* Settings group — always last, sub-items expand downward */}
      <div className="flex flex-col gap-0.5">
        <p className={navSectionLabel}>School</p>
        <Link href="/dashboard/admin/settings">
          <button
            onClick={() => { setManualOpen(true); onClose?.(); }}
            aria-expanded={settingsOpen}
            aria-current={location === "/dashboard/admin/settings" ? "page" : undefined}
            className={navItemClass(location === "/dashboard/admin/settings")}
          >
            <Settings className={isInSettings ? navIconActive : navIconIdle} aria-hidden="true" />
            <span>Settings</span>
            <span className="ml-auto">
              {settingsOpen
                ? <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                : <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />}
            </span>
          </button>
        </Link>

        <div
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{ maxHeight: settingsOpen ? "200px" : "0px", opacity: settingsOpen ? 1 : 0 }}
        >
          <div className="mt-0.5 ml-5 pl-2 border-l border-sidebar-border flex flex-col gap-0.5">
            {settingsSubLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href}>
                  <button
                    onClick={onClose}
                    aria-current={isActive ? "page" : undefined}
                    className={navItemClass(isActive)}
                  >
                    <Icon className={isActive ? navIconActive : navIconIdle} aria-hidden="true" />
                    <span>{link.label}</span>
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {user?.role === "super_admin" && (
        <div className="mt-2 pt-2 border-t border-sidebar-border">
          <Link href="/super_admin">
            <button onClick={onClose} className={navItemClass(false)}>
              <Shield className={navIconIdle} aria-hidden="true" />
              <span>Platform Admin</span>
            </button>
          </Link>
        </div>
      )}
    </nav>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: school } = useGetMySchool({ query: { enabled: !!user?.schoolId } });
  const { showTour, launchTour, closeTour } = useTour(user?.role as "admin" | "super_admin");

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0 shrink-0">
        {/* Logo / School Name */}
        <div className="px-4 h-16 flex items-center border-b border-sidebar-border">
          <Link href="/dashboard/admin">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={brandMark} aria-hidden="true">
                {(school?.name || "S")[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-sidebar-accent-foreground font-semibold text-sm truncate leading-tight">
                  {school?.name || "SolomonQuest"}
                </p>
                <p className="text-sidebar-foreground/60 text-xs">Admin Panel</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 mb-1"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="mr-2 h-3.5 w-3.5" />
            Help Center
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/15"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </Button>
          <p className="text-center text-[10px] text-sidebar-foreground/40 tracking-widest uppercase mt-2">Powered by TIBLOGICS</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b flex items-center px-4 md:px-6 gap-3 sticky top-0 z-20">
          {/* Mobile menu trigger */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(18rem,85vw)] p-0 bg-sidebar text-sidebar-foreground border-r-0 flex flex-col gap-0 [&>button]:text-sidebar-foreground">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-4 h-16 flex items-center border-b border-sidebar-border">
                <div className="flex items-center gap-2.5">
                  <div className={brandMark} aria-hidden="true">
                    {(school?.name || "S")[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sidebar-accent-foreground font-semibold text-sm truncate">
                      {school?.name || "SolomonQuest"}
                    </p>
                    <p className="text-sidebar-foreground/60 text-xs">Admin Panel</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <NavLinks onClose={() => setIsMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="md:hidden font-semibold text-foreground truncate min-w-0">
            {school?.name || "SolomonQuest"}
          </div>

          <div className="hidden md:block flex-1" />

          <div className="flex items-center gap-2 ml-auto">
            <GlobalSearch />
            <ProfileMenu />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-5 md:p-6 lg:p-8 has-bottom-nav md:pb-8">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav
        links={bottomNavPrimaryLinks}
        moreCount={bottomNavOverflowLinks.length}
        onMoreClick={() => setIsMobileOpen(true)}
        moreActive={bottomNavOverflowLinks.some(
          (l) => location === l.href || location.startsWith(`${l.href}/`)
        )}
      />

      {/* AI Agent */}
      <AgentWidget />

      {/* Notes */}
      <NotesWidget />
      <StickyNotesLayer />

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
