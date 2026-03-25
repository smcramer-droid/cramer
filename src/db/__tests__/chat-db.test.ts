import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock better-sqlite3 before importing ChatDatabase
vi.mock("better-sqlite3", () => {
  const mockPrepare = vi.fn();
  const mockPragma = vi.fn();
  const mockClose = vi.fn();

  const MockDatabase = vi.fn(() => ({
    prepare: mockPrepare,
    pragma: mockPragma,
    close: mockClose,
  }));

  return { default: MockDatabase };
});

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}));

import Database from "better-sqlite3";
import { ChatDatabase } from "../chat-db.js";

describe("ChatDatabase", () => {
  let db: ChatDatabase;
  let mockInstance: ReturnType<typeof Database>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new ChatDatabase("/fake/path/chat.db");
    mockInstance = (Database as unknown as ReturnType<typeof vi.fn>).mock
      .results[0].value;
  });

  it("should initialize with readonly mode", () => {
    expect(Database).toHaveBeenCalledWith("/fake/path/chat.db", {
      readonly: true,
      fileMustExist: true,
    });
  });

  it("should set WAL journal mode", () => {
    expect(mockInstance.pragma).toHaveBeenCalledWith("journal_mode = WAL");
  });

  it("should poll for new messages after cursor init", () => {
    // Mock initCursor
    const mockGet = vi.fn().mockReturnValue({ max_id: 100 });
    const mockAll = vi.fn().mockReturnValue([
      {
        rowId: 101,
        text: "Hello",
        sender: "+15551234567",
        chatId: "iMessage;-;+15551234567",
        chatName: null,
        date: 700000000000000000,
        isFromMe: 0,
      },
    ]);

    (mockInstance.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
      get: mockGet,
      all: mockAll,
    });

    db.initCursor(60);
    const messages = db.poll();

    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("Hello");
    expect(messages[0].sender).toBe("+15551234567");
    expect(messages[0].isFromMe).toBe(false);
  });

  it("should skip messages without text", () => {
    const mockGet = vi.fn().mockReturnValue({ max_id: 100 });
    const mockAll = vi.fn().mockReturnValue([
      {
        rowId: 101,
        text: null,
        sender: "+15551234567",
        chatId: "iMessage;-;+15551234567",
        chatName: null,
        date: 700000000000000000,
        isFromMe: 0,
      },
    ]);

    (mockInstance.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
      get: mockGet,
      all: mockAll,
    });

    db.initCursor(60);
    const messages = db.poll();
    expect(messages).toHaveLength(0);
  });

  it("should close the database", () => {
    db.close();
    expect(mockInstance.close).toHaveBeenCalled();
  });
});
