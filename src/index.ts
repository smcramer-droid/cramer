export { IMessageChannel } from "./plugin/imessage-channel.js";
export { ChatDatabase } from "./db/chat-db.js";
export { ClaudeHandler } from "./handler/claude.js";
export { sendIMessage, sendToGroupChat } from "./sender/applescript.js";
export {
  IncomingMessageSchema,
  PluginConfigSchema,
} from "./types/message.js";
export type {
  IncomingMessage,
  OutgoingMessage,
  PluginConfig,
  MessageHandler,
} from "./types/message.js";
export type { MessageHandler as ChannelMessageHandler } from "./plugin/imessage-channel.js";

// --- CLI entry point ---

if (process.argv[1] === import.meta.filename) {
  const { IMessageChannel } = await import("./plugin/imessage-channel.js");
  const { ClaudeHandler } = await import("./handler/claude.js");

  const claude = new ClaudeHandler({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    maxHistory: Number(process.env.MAX_HISTORY) || 20,
  });

  const channel = new IMessageChannel({
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 2000,
    allowedSenders: process.env.ALLOWED_SENDERS
      ? process.env.ALLOWED_SENDERS.split(",").map((s) => s.trim())
      : [],
    lookbackSeconds: Number(process.env.LOOKBACK_SECONDS) || 60,
  });

  channel.onMessage(async (msg) => {
    // "reset" clears conversation history
    if (msg.text.trim().toLowerCase() === "reset") {
      claude.clearHistory(msg.sender);
      return "Conversation cleared. Fresh start!";
    }

    return claude.handle(msg);
  });

  channel.start();
  console.log("[imessage] Claude handler active — waiting for messages...");

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[imessage] Shutting down...");
    channel.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
