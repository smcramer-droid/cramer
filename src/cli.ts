#!/usr/bin/env node

import { IMessageChannel } from "./plugin/imessage-channel.js";
import { ClaudeHandler } from "./handler/claude.js";

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
  triggerPrefix: process.env.TRIGGER_PREFIX ?? "c",
  allowSelfMessages: process.env.ALLOW_SELF !== "false",
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
