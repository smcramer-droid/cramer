import { z } from "zod";

/** Schema for an incoming iMessage read from chat.db */
export const IncomingMessageSchema = z.object({
  /** Unique row ID from the message table */
  rowId: z.number(),
  /** Message body text */
  text: z.string(),
  /** Sender phone number or email (handle_id resolved) */
  sender: z.string(),
  /** Chat identifier (e.g. "iMessage;-;+15551234567") */
  chatId: z.string(),
  /** Display name of the chat/group, if available */
  chatName: z.string().nullable(),
  /** Unix timestamp in seconds */
  timestamp: z.number(),
  /** Whether this message was sent by the local user */
  isFromMe: z.boolean(),
});

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

/** Outgoing message to be sent via AppleScript */
export interface OutgoingMessage {
  /** Recipient phone number, email, or chat name */
  to: string;
  /** Message body text */
  text: string;
}

/** Plugin configuration */
export const PluginConfigSchema = z.object({
  /** Path to the iMessage chat.db (defaults to ~/Library/Messages/chat.db) */
  dbPath: z.string().optional(),
  /** Polling interval in milliseconds for new messages (default: 2000) */
  pollIntervalMs: z.number().min(500).default(2000),
  /** Only process messages from these senders (phone/email). Empty = all. */
  allowedSenders: z.array(z.string()).default([]),
  /** Ignore messages older than this many seconds at startup (default: 60) */
  lookbackSeconds: z.number().default(60),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;
