import { supabase } from "@/lib/supabase";

/** Thrown by apiJson for non-2xx responses; `message` is the API's `error`. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * fetch() against /api with the signed-in user's bearer token, JSON in/out.
 * Throws ApiError with the server's `{ error }` message on failure.
 */
export async function apiJson<T = unknown>(url: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const { json, headers, ...rest } = options;
  const res = await fetch(url, {
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string })?.error ?? `Request failed (${res.status})`);
  return body as T;
}
