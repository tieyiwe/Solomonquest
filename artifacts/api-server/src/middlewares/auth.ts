import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  schoolId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.substring(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.userId = data.user.id;

  // Fetch profile to get role + school
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, school_id")
    .eq("id", data.user.id)
    .single();

  if (profile) {
    req.userRole = profile.role;
    req.schoolId = profile.school_id;
  }

  next();
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user) {
      req.userId = data.user.id;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, school_id")
        .eq("id", data.user.id)
        .single();
      if (profile) {
        req.userRole = profile.role;
        req.schoolId = profile.school_id;
      }
    }
  }
  next();
}
