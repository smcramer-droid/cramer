import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./types";

export type Msg = { role: "user" | "assistant"; content: string };

export function client(env: Env): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export async function chat(
  env: Env,
  opts: {
    system: string;
    messages: Msg[];
    model?: string;
    maxTokens?: number;
  }
): Promise<string> {
  const anthropic = client(env);
  const resp = await anthropic.messages.create({
    model: opts.model ?? env.CLAUDE_MODEL_DAILY,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages,
  });
  // Concatenate any text blocks.
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
