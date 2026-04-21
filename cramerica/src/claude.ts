import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./types";

export type Msg = { role: "user" | "assistant"; content: string };

export function client(env: Env, opts?: { timeoutMs?: number }): Anthropic {
  // Default timeout tuned for the 30s Worker request-path wall-clock:
  // fail fast so the outer try/catch runs before CF kills the isolate.
  // Callers running in Durable Object alarms (15min budget) should pass
  // a longer timeout — e.g., program generation on Opus.
  // maxRetries=0: SDK's default of 2 can stack retries past the wall-clock
  // before any JS catch block sees the error.
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 0,
    timeout: opts?.timeoutMs ?? 25_000,
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
