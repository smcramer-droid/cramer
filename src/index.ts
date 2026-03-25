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
} from "./types/message.js";
export type { MessageHandler as ChannelMessageHandler } from "./plugin/imessage-channel.js";
