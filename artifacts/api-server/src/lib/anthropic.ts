import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  client = new Anthropic({ apiKey });
  return client;
}

// The capable model — used only when a request plausibly needs tool use
// (an action: reminders, announcements, broadcasts, forum posts, opening a
// report) or otherwise benefits from stronger reasoning.
export const AGENT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

// The cheap/fast model — used for plain questions that don't need tools.
// Most agent turns in a school admin's day (\"how many students do we
// have\", \"when's the next assignment due\") are exactly this: no tool
// call needed, so there's no reason to pay Sonnet-level cost for them.
export const AGENT_MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";
