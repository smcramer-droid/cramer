import { sendFirstQuestion } from "../assessment";
import { checkinKeyboard } from "../buttons";
import { sendStatsPack } from "../charts";
import { chat } from "../claude";
import {
  appendMessage,
  ensureWeekSessions,
  getCurrentWeekProgress,
  getDailyLog,
  getProfile,
  getStreak,
  recentMessages,
  recomputeDailyStreak,
  recomputeWeekStreak,
} from "../db";
import { pickRoutineForDate } from "../pliability";
import { checkinDirective } from "../prompts/checkins";
import { buildSystemPrompt } from "../prompts/system";
import { sendChatAction, sendMessage } from "../telegram";
import { computeWeeklyStats, ensureWeekProgram, formatWeeklyStatsForPrompt } from "../weekly";
import type { Env, Slot } from "../types";

export async function fireCheckin(env: Env, slot: Slot, date: string, weekStart: string): Promise<void> {
  const profile = await getProfile(env);
  if (!profile.chat_id) {
    console.warn("no chat_id captured yet; skipping check-in", slot);
    return;
  }

  // Week-1 intake gate: if assessment isn't complete, the morning slot
  // kicks it off (or re-kicks if the user hasn't replied). Other slots
  // stay quiet until the intake finishes.
  if (!profile.assessment_complete) {
    if (slot === "morning") {
      await sendFirstQuestion(env, profile.chat_id);
    }
    return;
  }

  await ensureWeekSessions(env, weekStart);
  await ensureWeekProgram(env, weekStart, profile, date);
  await recomputeDailyStreak(env, date, profile);
  await recomputeWeekStreak(env, date, profile);

  const [log, streak, weekRows, weekSoFar] = await Promise.all([
    getDailyLog(env, date),
    getStreak(env),
    env.DB
      .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=? ORDER BY letter")
      .bind(weekStart)
      .all<{ letter: "A" | "B" | "C"; completed_date: string | null }>(),
    getCurrentWeekProgress(env, date, weekStart, profile),
  ]);

  const routine = pickRoutineForDate(date);
  let weeklyStatsBlock: string | null = null;
  if (slot === "sunday_retro") {
    const stats = await computeWeeklyStats(env, date, profile, weekStart);
    weeklyStatsBlock = formatWeeklyStatsForPrompt(stats, profile);
  }

  // TRT + peptides: Wed evenings and Sun evenings. The coach should work
  // it into the check-in naturally; no separate ping.
  const etDow = new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  )).getUTCDay();
  const isWedEvening = etDow === 3 && slot === "evening";
  const isSunEvening = etDow === 0 && slot === "sunday_retro";
  const medReminder = (isWedEvening || isSunEvening)
    ? "Tonight is a TRT + peptides night. Work it into the check-in — remind him to take them before bed."
    : null;

  const system = buildSystemPrompt({
    profile,
    today: date,
    log,
    streak,
    weekSessions: weekRows.results ?? [],
    pliabilityRoutine: `${routine.name}\n${routine.script}`,
    weekSoFar,
    weeklyStats: weeklyStatsBlock,
    medReminder,
  });

  const history = await recentMessages(env, 16);
  const messages = [...history, { role: "user" as const, content: checkinDirective(slot) }];

  await sendChatAction(env, profile.chat_id).catch(() => {});
  const reply = await chat(env, { system, messages, maxTokens: slot === "sunday_retro" ? 1400 : 900 });
  await sendMessage(env, profile.chat_id, reply, { reply_markup: checkinKeyboard(slot) });
  await appendMessage(env, "assistant", reply, slot);

  // Sunday retro: follow up with the weekly chart pack.
  if (slot === "sunday_retro") {
    await sendStatsPack(env, profile.chat_id, profile).catch((e) => console.error("chart pack error", e));
  }
}
