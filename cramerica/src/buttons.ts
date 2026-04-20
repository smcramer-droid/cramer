import type { InlineKeyboardMarkup } from "./telegram";
import type { Slot } from "./types";

// Callback data format: "log:<action>[:<arg>]"
// Keep payloads short — Telegram caps callback_data at 64 bytes.

export type QuickAction =
  | { kind: "pliability" }
  | { kind: "strength"; letter?: "A" | "B" | "C" }
  | { kind: "cardio"; minutes: number }
  | { kind: "meal" };

export function encodeAction(a: QuickAction): string {
  switch (a.kind) {
    case "pliability": return "log:pliability";
    case "strength":   return a.letter ? `log:strength:${a.letter}` : "log:strength";
    case "cardio":     return `log:cardio:${a.minutes}`;
    case "meal":       return "log:meal";
  }
}

export function decodeAction(data: string): QuickAction | null {
  if (!data.startsWith("log:")) return null;
  const parts = data.split(":");
  const kind = parts[1];
  switch (kind) {
    case "pliability": return { kind: "pliability" };
    case "strength": {
      const letter = parts[2] as "A" | "B" | "C" | undefined;
      return letter && "ABC".includes(letter) ? { kind: "strength", letter } : { kind: "strength" };
    }
    case "cardio": {
      const m = Number(parts[2]);
      return Number.isFinite(m) && m > 0 ? { kind: "cardio", minutes: m } : null;
    }
    case "meal": return { kind: "meal" };
    default: return null;
  }
}

// Default buttons surfaced on morning/midday/evening check-ins.
// Sunday retro intentionally has no buttons — want the full conversation.
export function checkinKeyboard(slot: Slot): InlineKeyboardMarkup | undefined {
  if (slot === "sunday_retro") return undefined;
  return {
    inline_keyboard: [
      [
        { text: "✅ Pliability (10m)", callback_data: encodeAction({ kind: "pliability" }) },
        { text: "✅ Strength done", callback_data: encodeAction({ kind: "strength" }) },
      ],
      [
        { text: "✅ Cardio 30m", callback_data: encodeAction({ kind: "cardio", minutes: 30 }) },
        { text: "✅ Meal logged", callback_data: encodeAction({ kind: "meal" }) },
      ],
    ],
  };
}

// After a button is used, strip it from the keyboard so it can't be tapped twice.
export function stripAction(
  markup: InlineKeyboardMarkup | undefined,
  used: string
): InlineKeyboardMarkup | null {
  if (!markup) return null;
  const rows = markup.inline_keyboard
    .map((row) => row.filter((b) => b.callback_data !== used))
    .filter((row) => row.length > 0);
  return rows.length === 0 ? null : { inline_keyboard: rows };
}
