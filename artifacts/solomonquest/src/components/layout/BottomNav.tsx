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
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-card border-t flex md:hidden">
      {primaryLinks.map((link) => {
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
      {showMore && (
        <button
          onClick={onMoreClick}
          className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${
            moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MoreHorizontal className={`h-5 w-5 ${moreActive ? "scale-110" : ""}`} strokeWidth={moreActive ? 2.5 : 1.8} />
          <span className={`text-[10px] font-medium leading-none ${moreActive ? "font-semibold" : ""}`}>More</span>
        </button>
      )}
    </nav>
  );
}
