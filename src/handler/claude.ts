import Anthropic from "@anthropic-ai/sdk";
import type { IncomingMessage } from "../types/message.js";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are Claude, chatting with a user over iMessage. Keep your responses concise and conversational — this is a text message, not an essay. Use short paragraphs. Avoid markdown formatting (no headers, bullet lists, or code blocks) since iMessage doesn't render it.`;

/**
 * Claude-powered message handler with per-sender conversation history.
 */
export class ClaudeHandler {
  private client: Anthropic;
  private model: string;
  private conversations: Map<string, ConversationMessage[]> = new Map();
  private maxHistory: number;

  constructor(opts: { model?: string; maxHistory?: number } = {}) {
    this.client = new Anthropic();
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxHistory = opts.maxHistory ?? 20;
  }

  /** Process an incoming iMessage and return Claude's reply. */
  async handle(msg: IncomingMessage): Promise<string> {
    const history = this.conversations.get(msg.sender) ?? [];

    history.push({ role: "user", content: msg.text });

    // Trim old messages to stay within limits
    while (history.length > this.maxHistory) {
      history.shift();
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const reply =
      response.content[0].type === "text"
        ? response.content[0].text
        : "(Unable to generate a response)";

    history.push({ role: "assistant", content: reply });
    this.conversations.set(msg.sender, history);

    return reply;
  }

  /** Clear conversation history for a sender (e.g. on "reset" command). */
  clearHistory(sender: string): void {
    this.conversations.delete(sender);
  }

  /** Clear all conversation histories. */
  clearAll(): void {
    this.conversations.clear();
  }
}
