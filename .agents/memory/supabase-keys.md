---
name: SolomonQuest Supabase key setup
description: How Supabase credentials are wired in this project and why SUPABASE_SVC_KEY exists
---

# Supabase Key Configuration

## The setup
- Project ref: `snxbrnwmzvyfrkwotqka`
- URL env var: `NEXT_PUBLIC_SUPABASE_URL` (shared env var, value: `https://snxbrnwmzvyfrkwotqka.supabase.co`)
- Anon key: `SUPABASE_ANON_KEY` (Replit secret — correct project)
- Service role key: **`SUPABASE_SVC_KEY`** (shared env var) — NOT `SUPABASE_SERVICE_ROLE_KEY`

## Why SUPABASE_SVC_KEY instead of SUPABASE_SERVICE_ROLE_KEY
The Replit secret `SUPABASE_SERVICE_ROLE_KEY` was set with a key from a different Supabase project (`oojttenohefbrhatbzxq`) and could not be overridden (Replit blocks env vars from overriding secrets with the same name, and `requestEnvVar` didn't update the stored value). Workaround: store the correct key as `SUPABASE_SVC_KEY` env var (shared) and update `lib/supabase.ts` to read `SUPABASE_SVC_KEY ?? SUPABASE_SERVICE_ROLE_KEY`.

**Why:** setEnvVars cannot overwrite a secret name; must use a different key name.
**How to apply:** If the service role key ever needs updating, update `SUPABASE_SVC_KEY` via setEnvVars or the Replit env vars panel (not Secrets).
