import { assessmentProgress, finalizeAssessment, sendFirstQuestion } from "./assessment";
import { sendStatsPack } from "./charts";
import {
  appendMessage,
  ensureWeekSessions,
  getDailyLog,
  getProfile,
  getStreak,
  recomputeDailyStreak,
} from "./db";
import { fireCheckin } from "./handlers/checkin";
import { sendMessage } from "./telegram";
import { etNow } from "./time";
import type { Env } from "./types";

// Handles leading-slash commands. Returns true if the message was consumed.
export async function handleCommand(env: Env, chatId: number, text: string): Promise<boolean> {
  if (!text.startsWith("/")) return false;
  const cmd = text.split(/\s+/)[0]!.toLowerCase();

  switch (cmd) {
    case "/start":
    case "/begin": {
      const profile = await getProfile(env);
      if (profile.assessment_complete) {
        await sendMessage(env, chatId, "We're already rolling. Send me a meal photo, tap a quick-log button on the next check-in, or use /today for a status read.");
        return true;
      }
      const { answered, total } = await assessmentProgress(env);
      if (answered > 0 && answered < total) {
        await sendMessage(env, chatId, `Intake is in progress — ${answered}/${total} answered. Next question coming up.`);
      }
      await sendFirstQuestion(env, chatId);
      return true;
    }

    case "/regen": {
      const { answered, total } = await assessmentProgress(env);
      if (answered < total) {
        await sendMessage(env, chatId, `Intake isn't finished (${answered}/${total}). Run /start to continue.`);
        return true;
      }
      await sendMessage(env, chatId, "Regenerating the program. Give me a minute.");
      await finalizeAssessment(env);
      return true;
    }

    case "/retro": {
      const profile = await getProfile(env);
      if (!profile.assessment_complete) {
        await sendMessage(env, chatId, "Intake isn't complete yet. Run /start first.");
        return true;
      }
      const now = etNow();
      await fireCheckin(env, "sunday_retro", now.date, now.weekStart).catch((e) => {
        console.error("manual retro failed", e);
      });
      return true;
    }

    case "/today": {
      const now = etNow();
      const profile = await getProfile(env);
      await ensureWeekSessions(env, now.weekStart);
      await recomputeDailyStreak(env, now.date, profile);
      const [log, streak, sessions] = await Promise.all([
        getDailyLog(env, now.date),
        getStreak(env),
        env.DB
          .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=? ORDER BY letter")
          .bind(now.weekStart)
          .all<{ letter: string; completed_date: string | null }>(),
      ]);
      const mark = (hit: boolean) => (hit ? "✅" : "◻️");
      const proteinHit = log.protein_g >= profile.protein_goal_g;
      const calHit = log.calories != null && log.calories <= profile.calorie_cap;
      const cardioHit = log.cardio_min >= profile.cardio_goal_min;
      const pliaHit = log.pliability_min >= profile.pliability_goal_min;
      const pairs = (sessions.results ?? [])
        .map((s) => `${s.letter}:${s.completed_date ? "✅" : "◻️"}`)
        .join(" ");
      const body = `*${now.date}* — day ${streak.daily_count} streak (best ${streak.daily_best})

${mark(proteinHit)} Protein: ${log.protein_g}/${profile.protein_goal_g}g
${mark(calHit)} Calories: ${log.calories ?? "—"}/${profile.calorie_cap}
${mark(cardioHit)} Cardio: ${log.cardio_min}/${profile.cardio_goal_min} min
${mark(pliaHit)} Pliability: ${log.pliability_min}/${profile.pliability_goal_min} min

Strength week (${now.weekStart}): ${pairs}`;
      await sendMessage(env, chatId, body);
      await appendMessage(env, "assistant", body);
      return true;
    }

    case "/stats":
    case "/charts": {
      const profile = await getProfile(env);
      const sent = await sendStatsPack(env, chatId, profile);
      if (sent === 0) await sendMessage(env, chatId, "Not enough data for charts yet. Keep logging.");
      return true;
    }

    case "/help": {
      const body = `*Cramerica commands*

/start — begin the week-1 intake (or resume if partway)
/today — today's trackables + streak + strength week
/stats — send the chart pack (daily adherence, protein/cal, weight, strength)
/retro — re-open the Sunday retrospective on demand
/regen — retry program generation (if intake finished but program didn't)
/help — this message

Outside commands: send me meal photos, log via the buttons on check-ins, or just tell me what you did.`;
      await sendMessage(env, chatId, body);
      return true;
    }

    default:
      return false;
  }
}
