import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";

export type UsageEventType = "ai_chat" | "chat_message" | "forum_post" | "video_call";

interface UsageEventInput {
  schoolId: string;
  userId?: string | null;
  eventType: UsageEventType;
  aiModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget usage log — never throws, never blocks the caller's
 *  response. A failed log entry should never take down the feature it's
 *  instrumenting. */
export function logUsageEvent(input: UsageEventInput): void {
  supabaseAdmin
    .from("usage_events")
    .insert({
      school_id: input.schoolId,
      user_id: input.userId ?? null,
      event_type: input.eventType,
      ai_model: input.aiModel ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      metadata: input.metadata ?? null,
    })
    .then(({ error }) => {
      if (error) logger.warn({ err: error }, "[usageTracking] Failed to log usage event");
    });
}

// Rough published per-million-token pricing, USD — used only to give super
// admins a ballpark $ figure for AI spend per school, not for billing.
const MODEL_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export function estimateCostCents(model: string | null, inputTokens: number, outputTokens: number): number {
  const pricing = (model ? MODEL_PRICING_PER_MILLION[model] : undefined) ?? MODEL_PRICING_PER_MILLION["claude-sonnet-4-5-20250929"];
  const dollars = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return Math.round(dollars * 100);
}
