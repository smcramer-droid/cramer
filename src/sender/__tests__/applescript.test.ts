import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, "", "");
  }),
}));

import { execFile } from "node:child_process";
import { sendIMessage } from "../applescript.js";

describe("sendIMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call osascript with correct arguments", async () => {
    await sendIMessage({ to: "+15551234567", text: "Hello from Claude" });

    expect(execFile).toHaveBeenCalledWith(
      "osascript",
      ["-e", expect.stringContaining("+15551234567")],
      expect.objectContaining({ timeout: 15_000 }),
      expect.any(Function)
    );
  });

  it("should escape special characters in messages", async () => {
    await sendIMessage({ to: "+15551234567", text: 'Say "hello"' });

    const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const script = call[1][1] as string;
    expect(script).toContain('\\"hello\\"');
  });

  it("should throw on osascript failure", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error("osascript failed"), "", "");
      }
    );

    await expect(
      sendIMessage({ to: "+15551234567", text: "fail" })
    ).rejects.toThrow("Failed to send iMessage");
  });
});
