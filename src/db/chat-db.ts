import Database from "better-sqlite3";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import type { IncomingMessage } from "../types/message.js";

const DEFAULT_DB_PATH = `${homedir()}/Library/Messages/chat.db`;

/**
 * Read-only wrapper around the macOS iMessage chat.db SQLite database.
 * Provides methods to poll for new messages.
 */
export class ChatDatabase {
  private db: Database.Database;
  private lastRowId: number;

  constructor(dbPath?: string) {
    const path = dbPath ?? DEFAULT_DB_PATH;
    if (!existsSync(path)) {
      throw new Error(
        `iMessage database not found at ${path}. ` +
          "Ensure you are running on macOS with Messages app configured, " +
          "and that Full Disk Access is granted to your terminal."
      );
    }

    this.db = new Database(path, { readonly: true, fileMustExist: true });
    this.db.pragma("journal_mode = WAL");
    this.lastRowId = 0;
  }

  /**
   * Initialize the last-seen row ID so we only process new messages
   * arriving after startup. Optionally look back `lookbackSeconds`.
   */
  initCursor(lookbackSeconds = 60): void {
    const cutoff = this.macAbsoluteTime(Date.now() / 1000 - lookbackSeconds);
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(ROWID), 0) AS max_id
         FROM message
         WHERE date > ?`
      )
      .get(cutoff) as { max_id: number } | undefined;

    if (row && row.max_id > 0) {
      // Start just before the lookback window so those messages get picked up
      this.lastRowId = row.max_id - 1;
    } else {
      // No recent messages — start from the current max
      const latest = this.db
        .prepare("SELECT COALESCE(MAX(ROWID), 0) AS max_id FROM message")
        .get() as { max_id: number };
      this.lastRowId = latest.max_id;
    }
  }

  /**
   * Fetch all messages with ROWID > lastRowId, advancing the cursor.
   */
  poll(): IncomingMessage[] {
    const rows = this.db
      .prepare(
        `SELECT
           m.ROWID        AS rowId,
           m.text         AS text,
           h.id           AS sender,
           c.chat_identifier AS chatId,
           c.display_name AS chatName,
           m.date         AS date,
           m.is_from_me   AS isFromMe
         FROM message m
         LEFT JOIN handle h ON m.handle_id = h.ROWID
         JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
         JOIN chat c ON c.ROWID = cmj.chat_id
         WHERE m.ROWID > ?
         ORDER BY m.ROWID ASC`
      )
      .all(this.lastRowId) as Array<{
      rowId: number;
      text: string | null;
      sender: string | null;
      chatId: string;
      chatName: string | null;
      date: number;
      isFromMe: number;
    }>;

    const messages: IncomingMessage[] = [];

    for (const row of rows) {
      this.lastRowId = row.rowId;

      // Skip messages without text (attachments, reactions, etc.)
      if (!row.text) continue;

      messages.push({
        rowId: row.rowId,
        text: row.text,
        sender: row.sender ?? "unknown",
        chatId: row.chatId,
        chatName: row.chatName,
        timestamp: this.unixTime(row.date),
        isFromMe: row.isFromMe === 1,
      });
    }

    return messages;
  }

  close(): void {
    this.db.close();
  }

  /**
   * macOS stores message dates as "Mac Absolute Time" —
   * seconds since 2001-01-01 00:00:00 UTC, often in nanoseconds.
   */
  private macAbsoluteTime(unixSeconds: number): number {
    const MAC_EPOCH_OFFSET = 978307200; // seconds between 1970 and 2001
    // chat.db uses nanoseconds since Catalina (10.15)
    return (unixSeconds - MAC_EPOCH_OFFSET) * 1e9;
  }

  private unixTime(macDate: number): number {
    const MAC_EPOCH_OFFSET = 978307200;
    // Detect nanosecond vs second timestamps
    if (macDate > 1e15) {
      return Math.floor(macDate / 1e9) + MAC_EPOCH_OFFSET;
    }
    return macDate + MAC_EPOCH_OFFSET;
  }
}
