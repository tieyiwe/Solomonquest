import { SafeImage } from "@/components/common/SafeImage";
import { BrandTile } from "@/components/brand/BrandMark";
import { schoolLogoUrl } from "@/lib/schoolTheme";
import { useAuth } from "@/contexts/AuthContext";
import { getGetMySchoolQueryKey, useGetMySchool } from "@workspace/api-client-react";

/**
 * The school's mark for sidebars and mobile headers: its uploaded logo (on a
 * light tile so dark logos stay visible on the sidebar), else its initial on
 * the accent tile, else — no school — the SolomonQuest mark.
 */
export function SchoolLogoTile({
  school,
  className = "h-8 w-8",
}: {
  school?: { name?: string | null } | null;
  className?: string;
}) {
  const name = school?.name?.trim();
  if (!name) return <BrandTile className={className} />;
  const initial = (
    <span
      className={`${className} rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-sm shrink-0`}
      aria-hidden="true"
      data-testid="school-initial"
    >
      {name[0].toUpperCase()}
    </span>
  );
  const logo = schoolLogoUrl(school as Record<string, unknown>);
  if (!logo) return initial;
  return (
    <SafeImage
      src={logo}
      alt=""
      aria-hidden="true"
      data-testid="school-logo"
      className={`${className} rounded-lg bg-white object-contain p-0.5 shrink-0`}
      fallback={initial}
    />
  );
}

function useMySchool() {
  const { user } = useAuth();
  const { data } = useGetMySchool({
    query: { queryKey: getGetMySchoolQueryKey(), enabled: !!user?.schoolId && user?.role !== "super_admin" },
  });
  // The query key isn't per-user; ignore a cached school that isn't theirs.
  return data && data.id === user?.schoolId ? data : null;
}

/** Sidebar header for pages that draw their own sidebar: logo + school name. */
export function SidebarSchoolBrand({ subtitle }: { subtitle: string }) {
  const school = useMySchool();
  return (
    <div className="flex items-center gap-2.5 cursor-pointer min-w-0">
      <SchoolLogoTile school={school} />
      <div className="min-w-0">
        <p className="text-sidebar-accent-foreground font-semibold text-sm leading-tight truncate">{school?.name || "SolomonQuest"}</p>
        <p className="text-sidebar-foreground/60 text-xs">{subtitle}</p>
      </div>
    </div>
  );
}

/** Mobile top-bar title for those pages: small logo + school name. */
export function SchoolHeaderName() {
  const school = useMySchool();
  return (
    <span className="flex items-center gap-2 min-w-0">
      <SchoolLogoTile school={school} className="h-7 w-7" />
      <span className="truncate">{school?.name || "SolomonQuest"}</span>
    </span>
  );
}
