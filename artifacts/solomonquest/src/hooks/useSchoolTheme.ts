import { useLayoutEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { getGetMySchoolQueryKey, useGetMySchool } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  THEMED_ROUTE_RE,
  applyThemeCss,
  buildSchoolTheme,
  readThemeCache,
  schoolThemeCss,
  themeInputFromSchool,
  writeThemeCache,
} from "@/lib/schoolTheme";

/**
 * Applies the signed-in user's school colours and radius to the app's design
 * tokens (see lib/schoolTheme.ts). Mounted once, inside AuthProvider.
 *
 * - Only for a user with a school who is not a super admin, and only on
 *   in-app routes; public pages and the super admin console stay on the
 *   platform theme.
 * - index.html applies the last cached theme before first paint, and this
 *   hook re-applies the cache synchronously while the school is loading, so
 *   a reload does not flash the platform colours.
 * - Signing out (or a different user / school) drops the cache and the style.
 */
export function useSchoolTheme(): void {
  const { user, session, isLoading } = useAuth();
  const [location] = useLocation();
  const schoolId = user?.schoolId ?? null;
  const isSchoolUser = !!schoolId && user?.role !== "super_admin";

  const { data: school } = useGetMySchool({ query: { queryKey: getGetMySchoolQueryKey(), enabled: isSchoolUser } });

  const css = useMemo(() => {
    // The query key is not per-user, so make sure the cached response is
    // this user's school before trusting it.
    if (!school || !schoolId || (school as { id?: string }).id !== schoolId) return null;
    const input = themeInputFromSchool(school as unknown as Record<string, unknown>);
    const theme = input ? buildSchoolTheme(input) : null;
    return theme ? schoolThemeCss(theme) : "";
  }, [school, schoolId]);

  useLayoutEffect(() => {
    if (isLoading) return; // keep whatever the boot script applied
    if (!session || !user) {
      writeThemeCache(null);
      applyThemeCss(null);
      return;
    }
    if (!isSchoolUser) {
      writeThemeCache(null);
      applyThemeCss(null);
      return;
    }
    const cached = readThemeCache();
    const cacheIsMine = cached && cached.userId === user.id && cached.schoolId === schoolId;
    if (css !== null) {
      // "" = the school has no valid colour: platform theme.
      writeThemeCache(css ? { userId: user.id, schoolId: schoolId!, css } : null);
    } else if (!cacheIsMine) {
      writeThemeCache(null);
    }
    const active = css !== null ? css : cacheIsMine ? cached!.css : null;
    applyThemeCss(THEMED_ROUTE_RE.test(location) ? active || null : null);
  }, [isLoading, session, user, isSchoolUser, schoolId, css, location]);
}

export function SchoolThemeSync(): null {
  useSchoolTheme();
  return null;
}
