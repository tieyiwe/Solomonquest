import type { Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase";
import type { AuthenticatedRequest } from "../middlewares/auth";

/**
 * Feature keys a super admin can toggle per school (see
 * PUT /super-admin/schools/:id/features and the Feature Flags dialog in
 * SuperAdminDashboard.tsx). A key absent from enabled_features defaults to
 * enabled — only an explicit `false` turns a module off, matching the
 * frontend's `checked={features[f.key] !== false}`.
 */
export type FeatureKey = "chat" | "video_calls" | "forum" | "ai_agent" | "custom_domain" | "notes";

/** Short TTL cache so gating a high-traffic route (chat, forum) doesn't add
 *  a DB round-trip to every request — schools rarely toggle a feature, and
 *  a few seconds of staleness is an acceptable tradeoff, same pattern as
 *  profileCache.ts. */
const TTL_MS = 15_000;
const cache = new Map<string, { features: Record<string, boolean>; expiresAt: number }>();

async function getEnabledFeatures(schoolId: string): Promise<Record<string, boolean>> {
  const cached = cache.get(schoolId);
  if (cached && cached.expiresAt > Date.now()) return cached.features;

  const { data } = await supabaseAdmin.from("schools").select("enabled_features").eq("id", schoolId).single();
  const features = (data?.enabled_features as Record<string, boolean>) ?? {};
  cache.set(schoolId, { features, expiresAt: Date.now() + TTL_MS });
  return features;
}

export function invalidateFeatureCache(schoolId: string): void {
  cache.delete(schoolId);
}

export async function isFeatureEnabled(schoolId: string | undefined | null, key: FeatureKey): Promise<boolean> {
  if (!schoolId) return true;
  const features = await getEnabledFeatures(schoolId);
  return features[key] !== false;
}

/** Express middleware form — 403s with a clear message when the caller's
 *  school has this module turned off. super_admin always passes (not
 *  scoped to a school, and needs access to manage the toggle itself). */
export function requireSchoolFeature(key: FeatureKey) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.userRole === "super_admin") {
      next();
      return;
    }
    const enabled = await isFeatureEnabled(req.schoolId, key);
    if (!enabled) {
      res.status(403).json({ error: "This feature has been turned off for your school by the platform administrator." });
      return;
    }
    next();
  };
}
