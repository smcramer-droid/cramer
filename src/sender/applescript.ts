import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OutgoingMessage } from "../types/message.js";

const execFileAsync = promisify(execFile);

/**
 * Send an iMessage using macOS AppleScript via `osascript`.
 * Requires the Messages app to be running (it will be launched if not).
 */
export async function sendIMessage(msg: OutgoingMessage): Promise<void> {
  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${escapeAppleScript(msg.to)}" of targetService
      send "${escapeAppleScript(msg.text)}" to targetBuddy
    end tell
  `;

  try {
    await execFileAsync("osascript", ["-e", script], {
      timeout: 15_000,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to send iMessage to ${msg.to}: ${message}`);
  }
}

/**
 * Send a message to a group chat by chat name.
 */
export async function sendToGroupChat(
  chatName: string,
  text: string
): Promise<void> {
  const script = `
    tell application "Messages"
      set targetChat to chat "${escapeAppleScript(chatName)}"
      send "${escapeAppleScript(text)}" to targetChat
    end tell
  `;

  try {
    await execFileAsync("osascript", ["-e", script], {
      timeout: 15_000,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to send iMessage to group "${chatName}": ${message}`
    );
  }
}

/** Escape special characters for AppleScript string literals */
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
