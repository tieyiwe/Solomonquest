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

export const AGENT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
