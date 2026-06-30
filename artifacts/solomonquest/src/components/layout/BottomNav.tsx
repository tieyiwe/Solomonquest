import { Link, useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface BottomNavProps {
  links: NavItem[];
  onItemClick?: () => void;
}

export function BottomNav({ links, onItemClick }: BottomNavProps) {
  const [location] = useLocation();

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-card border-t flex md:hidden">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = location === link.href || location.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onItemClick}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon
              className={`h-5 w-5 transition-transform ${isActive ? "scale-110" : ""}`}
              strokeWidth={isActive ? 2.5 : 1.8}
            />
            <span className={`text-[10px] font-medium leading-none ${isActive ? "font-semibold" : ""}`}>
              {link.label}
            </span>
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-primary rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
