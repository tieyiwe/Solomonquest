import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BookOpen,
  MessageCircle,
  Menu,
  Users,
  Star,
  ClipboardList,
  X,
  Settings,
  User,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getNavItems(role?: string | null): NavItem[] {
  if (role === "admin" || role === "super_admin") {
    return [
      { label: "Home", href: "/dashboard/admin", icon: LayoutDashboard },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Courses", href: "/admin/courses", icon: BookOpen },
      { label: "Chat", href: "/chat", icon: MessageCircle },
    ];
  }
  if (role === "teacher") {
    return [
      { label: "Home", href: "/dashboard/teacher", icon: LayoutDashboard },
      { label: "Courses", href: "/teacher/courses", icon: BookOpen },
      { label: "Gradebook", href: "/teacher/gradebook", icon: Star },
      { label: "Chat", href: "/chat", icon: MessageCircle },
    ];
  }
  // student / staff / default
  return [
    { label: "Home", href: "/dashboard/student", icon: LayoutDashboard },
    { label: "Courses", href: "/courses", icon: BookOpen },
    { label: "Assignments", href: "/assignments", icon: ClipboardList },
    { label: "Chat", href: "/chat", icon: MessageCircle },
  ];
}

const moreItems: NavItem[] = [
  { label: "Profile", href: "/profile", icon: User },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help", icon: HelpCircle },
];

export default function MobileNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const navItems = getNavItems(user?.role);

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  return (
    <>
      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t border-border safe-area-pb">
        <div className="flex items-stretch h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex flex-col items-center justify-center flex-1 gap-1 text-xs font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{item.label}</span>
                </a>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center justify-center flex-1 gap-1 text-xs font-medium text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-xl safe-area-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-base font-semibold text-foreground">More</h2>
              <button
                onClick={() => setSheetOpen(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="px-2 pb-4 space-y-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      onClick={() => setSheetOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </a>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
