import { mondayOfDate } from "./time";
import type { DailyLog, Env, Kid, Profile, Slot, Streak } from "./types";

export async function getProfile(env: Env): Promise<Profile> {
  const row = await env.DB
    .prepare("SELECT * FROM profile WHERE id=1")
    .first<Record<string, unknown>>();
  if (!row) throw new Error("profile row missing");
  const kids = JSON.parse(String(row.kids_json ?? "[]")) as Kid[];
  return {
    chat_id: row.chat_id == null ? null : Number(row.chat_id),
    wife_name: String(row.wife_name),
    kids,
    weight_lbs: row.weight_lbs == null ? null : Number(row.weight_lbs),
    body_fat_pct: row.body_fat_pct == null ? null : Number(row.body_fat_pct),
    age: row.age == null ? null : Number(row.age),
    height_in: row.height_in == null ? null : Number(row.height_in),
    handicap: row.handicap == null ? null : Number(row.handicap),
    target_date: String(row.target_date),
    target_bf_pct: Number(row.target_bf_pct),
    protein_goal_g: Number(row.protein_goal_g),
    calorie_cap: Number(row.calorie_cap),
    cardio_goal_min: Number(row.cardio_goal_min),
    pliability_goal_min: Number(row.pliability_goal_min),
    assessment_complete: Number(row.assessment_complete) === 1,
  };
}

export async function setChatId(env: Env, chatId: number): Promise<void> {
  await env.DB
    .prepare("UPDATE profile SET chat_id=?, updated_at=datetime('now') WHERE id=1")
    .bind(chatId)
    .run();
}

export async function upsertDailyLog(env: Env, date: string): Promise<void> {
  await env.DB
    .prepare("INSERT OR IGNORE INTO daily_log (date) VALUES (?)")
    .bind(date)
    .run();
}

export async function getDailyLog(env: Env, date: string): Promise<DailyLog> {
  await upsertDailyLog(env, date);
  const row = await env.DB
    .prepare("SELECT * FROM daily_log WHERE date=?")
    .bind(date)
    .first<Record<string, unknown>>();
  return {
    date: String(row!.date),
    protein_g: Number(row!.protein_g),
    calories: row!.calories == null ? null : Number(row!.calories),
    cardio_min: Number(row!.cardio_min),
    pliability_min: Number(row!.pliability_min),
    faith_done: Number(row!.faith_done ?? 0) === 1,
    meals_logged: Number(row!.meals_logged),
    weight_lbs: row!.weight_lbs == null ? null : Number(row!.weight_lbs),
    notes: row!.notes == null ? null : String(row!.notes),
  };
}

export async function logProtein(env: Env, date: string, grams: number): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET protein_g = protein_g + ?, updated_at=datetime('now') WHERE date=?"
  ).bind(grams, date).run();
}
export async function setCalories(env: Env, date: string, calories: number): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET calories=?, updated_at=datetime('now') WHERE date=?"
  ).bind(calories, date).run();
}
export async function logCardio(env: Env, date: string, minutes: number): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET cardio_min = cardio_min + ?, updated_at=datetime('now') WHERE date=?"
  ).bind(minutes, date).run();
}
export async function logPliability(env: Env, date: string, minutes: number): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET pliability_min = pliability_min + ?, updated_at=datetime('now') WHERE date=?"
  ).bind(minutes, date).run();
}
export async function markMealLogged(env: Env, date: string): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET meals_logged = meals_logged + 1, updated_at=datetime('now') WHERE date=?"
  ).bind(date).run();
}
export async function markFaithDone(env: Env, date: string): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET faith_done=1, updated_at=datetime('now') WHERE date=?"
  ).bind(date).run();
}
export async function setWeight(env: Env, date: string, weight: number): Promise<void> {
  await upsertDailyLog(env, date);
  await env.DB.prepare(
    "UPDATE daily_log SET weight_lbs=?, updated_at=datetime('now') WHERE date=?"
  ).bind(weight, date).run();
  await env.DB.prepare(
    "UPDATE profile SET weight_lbs=?, updated_at=datetime('now') WHERE id=1"
  ).bind(weight).run();
}

export async function markStrength(env: Env, weekStart: string, date: string): Promise<"A" | "B" | "C" | null> {
  // Assign to earliest open session whose pair includes `date`.
  const rows = await env.DB
    .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=? ORDER BY letter")
    .bind(weekStart)
    .all<{ letter: "A" | "B" | "C"; completed_date: string | null }>();
  for (const r of rows.results ?? []) {
    if (r.completed_date) continue;
    await env.DB
      .prepare("UPDATE strength_session SET completed_date=? WHERE week_start=? AND letter=?")
      .bind(date, weekStart, r.letter)
      .run();
    return r.letter;
  }
  return null;
}

export async function ensureWeekSessions(env: Env, weekStart: string): Promise<void> {
  for (const letter of ["A", "B", "C"] as const) {
    await env.DB
      .prepare("INSERT OR IGNORE INTO strength_session (week_start, letter) VALUES (?, ?)")
      .bind(weekStart, letter)
      .run();
  }
}

export async function appendMessage(env: Env, role: "user" | "assistant", content: string, slot?: Slot | null): Promise<void> {
  await env.DB
    .prepare("INSERT INTO message (role, content, slot) VALUES (?, ?, ?)")
    .bind(role, content, slot ?? null)
    .run();
}

export async function recentMessages(env: Env, limit = 20): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await env.DB
    .prepare("SELECT role, content FROM message ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<{ role: "user" | "assistant"; content: string }>();
  return (rows.results ?? []).reverse();
}

export async function getStreak(env: Env): Promise<Streak> {
  const row = await env.DB
    .prepare("SELECT daily_count, daily_best, week_count, week_best FROM streak WHERE id=1")
    .first<Streak>();
  return row ?? { daily_count: 0, daily_best: 0, week_count: 0, week_best: 0 };
}

export async function recomputeDailyStreak(env: Env, today: string, profile: Profile): Promise<void> {
  // Streak gates: protein, calories, cardio, pliability, faith (all 5 must
  // hit). Walk backwards from yesterday until we hit a miss.
  let count = 0;
  let cursor = shiftDate(today, -1);
  for (let i = 0; i < 365; i++) {
    const row = await env.DB
      .prepare("SELECT protein_g, calories, cardio_min, pliability_min, faith_done FROM daily_log WHERE date=?")
      .bind(cursor)
      .first<{ protein_g: number; calories: number | null; cardio_min: number; pliability_min: number; faith_done: number }>();
    if (!row) break;
    const hit =
      row.protein_g >= profile.protein_goal_g &&
      row.calories != null && row.calories <= profile.calorie_cap &&
      row.cardio_min >= profile.cardio_goal_min &&
      row.pliability_min >= profile.pliability_goal_min &&
      Number(row.faith_done) === 1;
    if (!hit) break;
    count++;
    cursor = shiftDate(cursor, -1);
  }
  const best = Math.max(count, (await getStreak(env)).daily_best);
  await env.DB
    .prepare("UPDATE streak SET daily_count=?, daily_best=?, last_computed=datetime('now') WHERE id=1")
    .bind(count, best)
    .run();
}

// Progress through the current (in-progress) week, counting only days
// that are already fully complete (i.e., excluding today since it can
// still be hit). Used for "week so far: X/N days clean" on /today and
// in the system prompt.
export async function getCurrentWeekProgress(
  env: Env,
  today: string,
  weekStart: string,
  profile: Profile
): Promise<{ hitDays: number; completedDays: number }> {
  const completedDays = daysBetween(weekStart, today);
  if (completedDays <= 0) return { hitDays: 0, completedDays: 0 };
  const rows = await env.DB
    .prepare(
      `SELECT protein_g, calories, cardio_min, pliability_min, faith_done
       FROM daily_log WHERE date >= ? AND date < ?`
    )
    .bind(weekStart, today)
    .all<{ protein_g: number; calories: number | null; cardio_min: number; pliability_min: number; faith_done: number }>();
  const hitDays = (rows.results ?? []).filter((r) =>
    r.protein_g >= profile.protein_goal_g &&
    r.calories != null && r.calories <= profile.calorie_cap &&
    r.cardio_min >= profile.cardio_goal_min &&
    r.pliability_min >= profile.pliability_goal_min &&
    Number(r.faith_done) === 1
  ).length;
  return { hitDays, completedDays };
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = end.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400_000);
}

export async function recomputeWeekStreak(env: Env, today: string, profile: Profile): Promise<void> {
  // A "good week" = ≥5 of 7 days had all 5 streak gates hit. We count the
  // current in-progress week too, but only count it toward the streak once
  // it already has ≥5 good days locked in. Walk back in 7-day Monday–Sunday
  // windows and break at the first week that doesn't qualify.
  const currentMonday = mondayOfDate(today);
  let cursor = currentMonday;
  let count = 0;
  let includesCurrent = true;
  for (let i = 0; i < 104; i++) {
    const weekEnd = shiftDate(cursor, 7); // exclusive
    const rows = await env.DB
      .prepare(
        `SELECT protein_g, calories, cardio_min, pliability_min, faith_done
         FROM daily_log WHERE date >= ? AND date < ?`
      )
      .bind(cursor, weekEnd)
      .all<{ protein_g: number; calories: number | null; cardio_min: number; pliability_min: number; faith_done: number }>();
    const perfectDays = (rows.results ?? []).filter((r) =>
      r.protein_g >= profile.protein_goal_g &&
      r.calories != null && r.calories <= profile.calorie_cap &&
      r.cardio_min >= profile.cardio_goal_min &&
      r.pliability_min >= profile.pliability_goal_min &&
      Number(r.faith_done) === 1
    ).length;
    if (perfectDays >= 5) {
      count++;
      cursor = shiftDate(cursor, -7);
      includesCurrent = false;
    } else if (includesCurrent) {
      // Current week not yet qualifying — don't count it, but still walk back.
      cursor = shiftDate(cursor, -7);
      includesCurrent = false;
    } else {
      break;
    }
  }
  const best = Math.max(count, (await getStreak(env)).week_best);
  await env.DB
    .prepare("UPDATE streak SET week_count=?, week_best=?, last_computed=datetime('now') WHERE id=1")
    .bind(count, best)
    .run();
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + days * 86400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function logError(env: Env, source: string, message: string, details?: unknown): Promise<void> {
  let d: string | null = null;
  if (details != null) {
    try {
      d = typeof details === "string" ? details : JSON.stringify(details);
    } catch {
      d = String(details);
    }
    if (d.length > 4000) d = d.slice(0, 4000) + "…[truncated]";
  }
  try {
    await env.DB
      .prepare("INSERT INTO error_log (source, message, details) VALUES (?, ?, ?)")
      .bind(source, message.slice(0, 1000), d)
      .run();
  } catch (e) {
    console.error("logError insert failed", e);
  }
}
