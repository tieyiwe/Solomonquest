/**
 * Shared sidebar navigation styling for every role's layout, so the shells
 * look and behave the same: deep-indigo sidebar, soft pill on hover, and a
 * gold indicator bar + raised pill on the active item.
 */
export const navItemBase =
  "relative w-full flex items-center gap-3 px-3 py-2 min-h-9 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

export const navItemIdle =
  "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground";

export const navItemActive =
  "bg-sidebar-accent text-sidebar-accent-foreground font-semibold hover:bg-sidebar-accent hover:text-sidebar-accent-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary";

export const navIconIdle = "h-4 w-4 shrink-0 text-sidebar-foreground/55";
export const navIconActive = "h-4 w-4 shrink-0 text-sidebar-primary";

export const navSectionLabel =
  "px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50";

export function navItemClass(active: boolean) {
  return `${navItemBase} ${active ? navItemActive : navItemIdle}`;
}

/** Brand mark used at the top of every sidebar. */
export const brandMark =
  "h-8 w-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-sm shrink-0";
