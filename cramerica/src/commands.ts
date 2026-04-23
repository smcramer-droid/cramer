import { assessmentProgress, sendFirstQuestion } from "./assessment";
import { triggerProgramGeneration } from "./program_generator";
import { sendStatsPack } from "./charts";
import {
  appendMessage,
  ensureWeekSessions,
  getCurrentWeekProgress,
  getDailyLog,
  getProfile,
  getStreak,
  markFaithDone,
  recomputeDailyStreak,
  recomputeWeekStreak,
} from "./db";
import { fireCheckin } from "./handlers/checkin";
import { pickRoutineForDate } from "./pliability";
import { sendMessage } from "./telegram";
import { etNow } from "./time";
import type { Env } from "./types";

// Handles leading-slash commands. Returns true if the message was consumed.
export async function handleCommand(env: Env, chatId: number, text: string): Promise<boolean> {
  if (!text.startsWith("/")) return false;
  const cmd = text.split(/\s+/)[0]!.toLowerCase();
  // Log the user command so status history shows it landed.
  await appendMessage(env, "user", text).catch(() => {});

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
      const ack = "Regenerating the program. I'll message you when it's ready (usually ~1 min).";
      await sendMessage(env, chatId, ack);
      await appendMessage(env, "assistant", ack);
      await triggerProgramGeneration(env);
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
      await recomputeWeekStreak(env, now.date, profile);
      const [log, streak, sessions, weekSoFar] = await Promise.all([
        getDailyLog(env, now.date),
        getStreak(env),
        env.DB
          .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=? ORDER BY letter")
          .bind(now.weekStart)
          .all<{ letter: string; completed_date: string | null }>(),
        getCurrentWeekProgress(env, now.date, now.weekStart, profile),
      ]);
      const mark = (hit: boolean) => (hit ? "✅" : "◻️");
      const proteinHit = log.protein_g >= profile.protein_goal_g;
      const calHit = log.calories != null && log.calories <= profile.calorie_cap;
      const cardioHit = log.cardio_min >= profile.cardio_goal_min;
      const pliaHit = log.pliability_min >= profile.pliability_goal_min;
      const faithHit = log.faith_done;
      const pairs = (sessions.results ?? [])
        .map((s) => `${s.letter}:${s.completed_date ? "✅" : "◻️"}`)
        .join(" ");
      const weekLine = weekSoFar.completedDays === 0
        ? "Week so far: fresh start — no completed days yet."
        : `Week so far: ${weekSoFar.hitDays}/${weekSoFar.completedDays} completed day${weekSoFar.completedDays === 1 ? "" : "s"} clean. (Week streak gate: ≥5/7.)`;
      const body = `*${now.date}* — day ${streak.daily_count} streak (best ${streak.daily_best}) · week ${streak.week_count} streak (best ${streak.week_best})

Streak gates (5):
${mark(proteinHit)} Protein: ${log.protein_g}/${profile.protein_goal_g}g
${mark(calHit)} Calories: ${log.calories ?? "—"}/${profile.calorie_cap}
${mark(cardioHit)} Cardio: ${log.cardio_min}/${profile.cardio_goal_min} min
${mark(pliaHit)} Pliability: ${log.pliability_min}/${profile.pliability_goal_min} min
${mark(faithHit)} Faith (prayer/scripture)

${weekLine}

Strength week (${now.weekStart}): ${pairs}`;
      await sendMessage(env, chatId, body);
      await appendMessage(env, "assistant", body);
      return true;
    }

    case "/pliability":
    case "/plyo":
    case "/mobility": {
      const now = etNow();
      const routine = pickRoutineForDate(now.date);
      const body = `*Today's 10-min pliability — ${routine.name}*\n\n${routine.script}`;
      await sendMessage(env, chatId, body);
      await appendMessage(env, "assistant", body);
      return true;
    }

    case "/faith":
    case "/prayer":
    case "/scripture": {
      const now = etNow();
      const profile = await getProfile(env);
      await markFaithDone(env, now.date);
      await recomputeDailyStreak(env, now.date, profile);
      await recomputeWeekStreak(env, now.date, profile);
      const body = "Faith time logged. ✓";
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
/today — today's streak gates + strength week
/pliability — today's 10-min mobility routine (aliases: /plyo, /mobility)
/faith — mark faith time done (aliases: /prayer, /scripture)
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
