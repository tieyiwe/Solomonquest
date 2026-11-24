import { Link, useLocation } from "wouter";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface BottomNavProps {
  links: NavItem[];
  onItemClick?: () => void;
  /** Remaining links that don't fit in the bar — shown behind a "More" tab
   * that opens the same drawer as the header's hamburger menu, instead of
   * cramming everything into flex-1 slots that become unreadable past ~4
   * items on a phone. */
  moreCount?: number;
  onMoreClick?: () => void;
  moreActive?: boolean;
}

// A native-feeling tab bar shows at most this many destinations plus a
// "More" tab — beyond that each icon+label gets too cramped to tap reliably.
const MAX_PRIMARY_TABS = 4;

export function BottomNav({ links, onItemClick, moreCount, onMoreClick, moreActive }: BottomNavProps) {
  const [location] = useLocation();
  const primaryLinks = links.slice(0, MAX_PRIMARY_TABS);
  const showMore = !!onMoreClick && (moreCount ?? 0) > 0;

  return (
    <nav aria-label="Primary" className="bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-t shadow-[0_-1px_3px_hsl(var(--foreground)/0.04)] flex md:hidden">
      {primaryLinks.map((link) => {
        const Icon = link.icon;
        // A role's dashboard root ("/dashboard/teacher") only lights up on itself,
        // so "Overview" isn't highlighted alongside "More" on every sub-page.
        const isRoot = /^\/dashboard\/[^/]+$/.test(link.href);
        const isActive = location === link.href || (!isRoot && location.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onItemClick}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`flex items-center justify-center h-7 w-12 rounded-full transition-colors ${isActive ? "bg-primary/10" : ""}`}>
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
            </span>
            <span className={`text-[11px] leading-none truncate max-w-full px-1 ${isActive ? "font-semibold" : "font-medium"}`}>
              {link.label}
            </span>
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-gold rounded-full" aria-hidden="true" />
            )}
          </Link>
        );
      })}
      {showMore && (
        <button
          onClick={onMoreClick}
          aria-label="More navigation options"
          className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
            moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className={`flex items-center justify-center h-7 w-12 rounded-full transition-colors ${moreActive ? "bg-primary/10" : ""}`}>
            <MoreHorizontal className="h-5 w-5" strokeWidth={moreActive ? 2.4 : 1.8} aria-hidden="true" />
          </span>
          <span className={`text-[11px] leading-none ${moreActive ? "font-semibold" : "font-medium"}`}>More</span>
        </button>
      )}
    </nav>
  );
}
