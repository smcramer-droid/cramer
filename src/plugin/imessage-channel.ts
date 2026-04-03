import { ChatDatabase } from "../db/chat-db.js";
import { sendIMessage, sendToGroupChat } from "../sender/applescript.js";
import { PluginConfigSchema } from "../types/message.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  PluginConfig,
} from "../types/message.js";

export type MessageHandler = (message: IncomingMessage) => Promise<string | null>;

/**
 * iMessage channel plugin for Claude.
 *
 * Polls the local macOS iMessage database for new messages,
 * invokes a handler (e.g. Claude) for each, and sends responses
 * back via AppleScript.
 */
export class IMessageChannel {
  private config: PluginConfig;
  private db: ChatDatabase;
  private handler: MessageHandler | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(rawConfig: Partial<PluginConfig> = {}) {
    this.config = PluginConfigSchema.parse(rawConfig);
    this.db = new ChatDatabase(this.config.dbPath);
  }

  /** Register the handler that processes incoming messages and returns a reply. */
  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  /** Start polling for new iMessages. */
  start(): void {
    if (this.running) return;

    this.db.initCursor(this.config.lookbackSeconds);
    this.running = true;

    console.log(
      `[imessage] Plugin started — polling every ${this.config.pollIntervalMs}ms`
    );

    if (this.config.triggerPrefix) {
      console.log(
        `[imessage] Trigger prefix: "${this.config.triggerPrefix}" — only messages starting with this will be processed`
      );
    }

    if (this.config.allowedSenders.length > 0) {
      console.log(
        `[imessage] Filtering to senders: ${this.config.allowedSenders.join(", ")}`
      );
    }

    // Run first poll immediately, then on interval
    void this.tick();
    this.pollTimer = setInterval(() => void this.tick(), this.config.pollIntervalMs);
  }

  /** Stop polling and clean up. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.db.close();
    console.log("[imessage] Plugin stopped");
  }

  /** Send a message directly (bypassing the handler). */
  async send(msg: OutgoingMessage): Promise<void> {
    await sendIMessage(msg);
  }

  /** Send a message to a group chat by name. */
  async sendToGroup(chatName: string, text: string): Promise<void> {
    await sendToGroupChat(chatName, text);
  }

  private async tick(): Promise<void> {
    if (!this.handler) return;

    let messages: IncomingMessage[];
    try {
      messages = this.db.poll();
    } catch (err) {
      console.error("[imessage] Error polling chat.db:", err);
      return;
    }

    for (let msg of messages) {
      // Skip own messages (unless self-messaging is enabled)
      if (msg.isFromMe && !this.config.allowSelfMessages) continue;

      // Apply sender filter
      if (
        this.config.allowedSenders.length > 0 &&
        !this.config.allowedSenders.includes(msg.sender)
      ) {
        continue;
      }

      // Apply trigger prefix filter
      if (this.config.triggerPrefix) {
        const prefix = this.config.triggerPrefix;
        const text = msg.text.trimStart();
        // Match "c hello" or "c hello" (prefix + space + message)
        if (!text.toLowerCase().startsWith(prefix.toLowerCase())) continue;
        // Strip the prefix and leading whitespace
        const strippedText = text.slice(prefix.length).trimStart();
        if (!strippedText) continue; // prefix alone with no message
        msg = { ...msg, text: strippedText };
      }

      console.log(
        `[imessage] Received from ${msg.sender}: ${msg.text.slice(0, 80)}${msg.text.length > 80 ? "..." : ""}`
      );

      try {
        const reply = await this.handler(msg);
        if (reply) {
          // For self-messages, extract the recipient from the chat identifier
          const replyTo = msg.sender !== "unknown"
            ? msg.sender
            : msg.chatId.split(";").pop() ?? msg.sender;
          await sendIMessage({ to: replyTo, text: reply });
          console.log(
            `[imessage] Replied to ${msg.sender}: ${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}`
          );
        }
      } catch (err) {
        console.error(`[imessage] Error handling message ${msg.rowId}:`, err);
      }
    }
  }
}
