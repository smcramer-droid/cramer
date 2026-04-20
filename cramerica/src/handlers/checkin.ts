import { chat } from "../claude";
import {
  appendMessage,
  ensureWeekSessions,
  getDailyLog,
  getProfile,
  getStreak,
  recentMessages,
  recomputeDailyStreak,
} from "../db";
import { pickRoutineForDate } from "../pliability";
import { checkinDirective } from "../prompts/checkins";
import { buildSystemPrompt } from "../prompts/system";
import { sendChatAction, sendMessage } from "../telegram";
import type { Env, Slot } from "../types";

export async function fireCheckin(env: Env, slot: Slot, date: string, weekStart: string): Promise<void> {
  const profile = await getProfile(env);
  if (!profile.chat_id) {
    console.warn("no chat_id captured yet; skipping check-in", slot);
    return;
  }

  await ensureWeekSessions(env, weekStart);
  await recomputeDailyStreak(env, date, profile);

  const [log, streak, weekRows] = await Promise.all([
    getDailyLog(env, date),
    getStreak(env),
    env.DB
      .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=? ORDER BY letter")
      .bind(weekStart)
      .all<{ letter: "A" | "B" | "C"; completed_date: string | null }>(),
  ]);

  const routine = pickRoutineForDate(date);
  const system = buildSystemPrompt({
    profile,
    today: date,
    log,
    streak,
    weekSessions: weekRows.results ?? [],
    pliabilityRoutine: `${routine.name}\n${routine.script}`,
  });

  const history = await recentMessages(env, 16);
  const messages = [...history, { role: "user" as const, content: checkinDirective(slot) }];

  await sendChatAction(env, profile.chat_id).catch(() => {});
  const reply = await chat(env, { system, messages, maxTokens: 900 });
  await sendMessage(env, profile.chat_id, reply);
  await appendMessage(env, "assistant", reply, slot);
}
