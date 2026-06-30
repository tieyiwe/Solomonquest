import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// SUPABASE_SVC_KEY is the env var (SUPABASE_SERVICE_ROLE_KEY secret had a stale value from another project)
const supabaseServiceKey = process.env.SUPABASE_SVC_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  logger.warn("Supabase environment variables not fully configured");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
