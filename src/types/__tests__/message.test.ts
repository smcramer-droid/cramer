import { describe, it, expect } from "vitest";
import { PluginConfigSchema, IncomingMessageSchema } from "../message.js";

describe("PluginConfigSchema", () => {
  it("should apply defaults for empty config", () => {
    const config = PluginConfigSchema.parse({});
    expect(config.pollIntervalMs).toBe(2000);
    expect(config.allowedSenders).toEqual([]);
    expect(config.lookbackSeconds).toBe(60);
  });

  it("should reject poll interval below 500ms", () => {
    expect(() =>
      PluginConfigSchema.parse({ pollIntervalMs: 100 })
    ).toThrow();
  });

  it("should accept valid config", () => {
    const config = PluginConfigSchema.parse({
      dbPath: "/custom/path/chat.db",
      pollIntervalMs: 5000,
      allowedSenders: ["+15551234567"],
      lookbackSeconds: 120,
    });
    expect(config.dbPath).toBe("/custom/path/chat.db");
    expect(config.pollIntervalMs).toBe(5000);
  });
});

describe("IncomingMessageSchema", () => {
  it("should validate a complete message", () => {
    const msg = IncomingMessageSchema.parse({
      rowId: 1,
      text: "Hello",
      sender: "+15551234567",
      chatId: "iMessage;-;+15551234567",
      chatName: null,
      timestamp: 1700000000,
      isFromMe: false,
    });
    expect(msg.text).toBe("Hello");
  });
});
