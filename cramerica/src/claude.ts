import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./types";

export type Msg = { role: "user" | "assistant"; content: string };

export function client(env: Env): Anthropic {
  // CF Workers have a 30s wall-clock budget per request. The SDK's
  // default maxRetries=2 can stack failures and blow past that limit
  // before any JS catch block runs. Fail fast so our outer try/catch
  // can log the failure and notify the user.
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 0,
    timeout: 25_000,
  });
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
