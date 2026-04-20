import type { Env, Slot } from "./types";
import { etNow, hmToMinute, type EtNow } from "./time";

// Windows in ET (minute-of-day ranges, inclusive start, exclusive end).
// Sunday's "evening" slot is replaced by sunday_retro.
const WINDOWS: Record<Exclude<Slot, "sunday_retro">, [number, number]> = {
  morning: [hmToMinute(7, 0), hmToMinute(9, 0)],
  midday:  [hmToMinute(12, 0), hmToMinute(14, 0)],
  evening: [hmToMinute(20, 0), hmToMinute(22, 0)],
};
const SUNDAY_RETRO_WINDOW: [number, number] = [hmToMinute(20, 0), hmToMinute(22, 0)];

// Leave the last 5 min of each window as buffer to guarantee we fire.
const BUFFER_MIN = 5;

export interface DueCheckin {
  slot: Slot;
  date: string;
  weekStart: string;
}

/**
 * Determine which (if any) check-in should fire on this cron tick.
 * Idempotent: if already fired today for the slot, returns null.
 * Picks a random target minute within each window on the first tick
 * of that window per day, persists it, then fires when we reach it.
 */
export async function checkDueCheckin(env: Env, now: EtNow = etNow()): Promise<DueCheckin | null> {
  const slots: Slot[] = now.dow === 0
    ? ["morning", "midday", "sunday_retro"]
    : ["morning", "midday", "evening"];

  for (const slot of slots) {
    const win = slot === "sunday_retro" ? SUNDAY_RETRO_WINDOW : WINDOWS[slot as Exclude<Slot, "sunday_retro">];
    if (now.minuteOfDay < win[0] || now.minuteOfDay >= win[1]) continue;

    // Has it already fired today?
    const row = await env.DB
      .prepare("SELECT planned_minute, fired_at FROM checkin WHERE date=? AND slot=?")
      .bind(now.date, slot)
      .first<{ planned_minute: number; fired_at: string | null }>();

    let planned: number;
    if (!row) {
      planned = randomMinuteInWindow(win);
      await env.DB
        .prepare("INSERT INTO checkin (date, slot, planned_minute) VALUES (?, ?, ?)")
        .bind(now.date, slot, planned)
        .run();
    } else {
      if (row.fired_at) continue;
      planned = row.planned_minute;
    }

    if (now.minuteOfDay >= planned) {
      await env.DB
        .prepare("UPDATE checkin SET fired_at=datetime('now') WHERE date=? AND slot=?")
        .bind(now.date, slot)
        .run();
      return { slot, date: now.date, weekStart: now.weekStart };
    }
  }
  return null;
}

function randomMinuteInWindow(win: [number, number]): number {
  const lo = win[0];
  const hi = Math.max(win[0], win[1] - BUFFER_MIN);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
