import { handleAssessmentReply } from "../assessment";
import { sendStatsPack } from "../charts";
import { chat } from "../claude";
import {
  appendMessage,
  ensureWeekSessions,
  getDailyLog,
  getProfile,
  getStreak,
  logCardio,
  logPliability,
  logProtein,
  markMealLogged,
  markStrength,
  recentMessages,
  setCalories,
  setChatId,
  setWeight,
} from "../db";
import { handlePendingClarification, handlePhoto } from "../meal";
import { pickRoutineForDate } from "../pliability";
import { buildSystemPrompt } from "../prompts/system";
import { sendChatAction, sendMessage, type TgMessage } from "../telegram";
import { etNow } from "../time";
import type { Env } from "../types";

// Heuristic parser: scans user text for structured log signals and writes
// them to the daily_log before Claude sees the message. Intentionally
// conservative — false positives are worse than missed logs (Claude can
// nudge for a re-log).
async function parseAndLog(env: Env, text: string, date: string, weekStart: string): Promise<string[]> {
  const logged: string[] = [];
  const lower = text.toLowerCase();

  // Protein: "180g protein", "200 g protein", "protein: 180"
  const pMatch = lower.match(/(\d{2,4})\s*g?\s*(?:of\s+)?protein\b|protein[:\s-]+(\d{2,4})/);
  if (pMatch) {
    const g = Number(pMatch[1] ?? pMatch[2]);
    if (g > 0 && g < 600) {
      // Treat explicit "so far" as set-total; otherwise additive.
      if (/so far|total|today|at /.test(lower)) {
        // Overwrite — set absolute.
        await env.DB.prepare("UPDATE daily_log SET protein_g=?, updated_at=datetime('now') WHERE date=?")
          .bind(g, date).run();
      } else {
        await logProtein(env, date, g);
      }
      logged.push(`protein ${g}g`);
    }
  }

  // Calories: "1550 cal", "1400 calories"
  const cMatch = lower.match(/(\d{3,5})\s*(?:cal|calories|kcal)\b/);
  if (cMatch) {
    const cal = Number(cMatch[1]);
    if (cal > 200 && cal < 6000) {
      await setCalories(env, date, cal);
      logged.push(`calories ${cal}`);
    }
  }

  // Cardio: "30 min cardio", "did 45 minutes on bike", "45m zone 2"
  const cardioMatch = lower.match(/(\d{1,3})\s*(?:m|min|mins|minutes)\s*(?:of\s+)?(?:cardio|zone\s*2|bike|row|run|walk|ride)/);
  if (cardioMatch) {
    const min = Number(cardioMatch[1]);
    if (min > 0 && min < 240) {
      await logCardio(env, date, min);
      logged.push(`cardio ${min}m`);
    }
  }

  // Pliability: "10 min pliability", "pliability done", "did pliability"
  if (/\bpliability\b/.test(lower)) {
    const plMatch = lower.match(/(\d{1,3})\s*(?:m|min|mins|minutes)\s*(?:of\s+)?pliability|pliability[:\s-]+(\d{1,3})/);
    const min = plMatch ? Number(plMatch[1] ?? plMatch[2]) : 10;
    if (min > 0 && min < 60) {
      await logPliability(env, date, min);
      logged.push(`pliability ${min}m`);
    }
  }

  // Strength: "hit session A", "did B today", "strength done"
  const sMatch = lower.match(/\b(?:session|strength)\s*([abc])\b|\b([abc])\s*(?:today|done)\b/);
  if (sMatch) {
    const letter = ((sMatch[1] ?? sMatch[2]) ?? "").toUpperCase() as "A" | "B" | "C";
    if (letter === "A" || letter === "B" || letter === "C") {
      await env.DB
        .prepare("UPDATE strength_session SET completed_date=? WHERE week_start=? AND letter=? AND completed_date IS NULL")
        .bind(date, weekStart, letter)
        .run();
      logged.push(`strength ${letter}`);
    }
  } else if (/strength done|lifted|finished (?:the )?lift|got the session/.test(lower)) {
    const marked = await markStrength(env, weekStart, date);
    if (marked) logged.push(`strength ${marked}`);
  }

  // Meal logged flag
  if (/logged (?:my )?(?:breakfast|lunch|dinner|meal|meals|food)|recorded (?:my )?meal/.test(lower)) {
    await markMealLogged(env, date);
    logged.push("meal logged");
  }

  // Weigh-in: "weighed 204", "weight 201.5"
  const wMatch = lower.match(/weigh(?:ed)?\s*(?:in\s*)?(?:at\s*)?(\d{2,3}(?:\.\d)?)|weight[:\s-]+(\d{2,3}(?:\.\d)?)/);
  if (wMatch) {
    const w = Number(wMatch[1] ?? wMatch[2]);
    if (w > 80 && w < 400) {
      await setWeight(env, date, w);
      logged.push(`weight ${w}lb`);
    }
  }

  return logged;
}

export async function handleIncoming(env: Env, msg: TgMessage): Promise<void> {
  // Auto-capture chat ID on first message (text, photo, or otherwise).
  const profile0 = await getProfile(env);
  if (!profile0.chat_id) {
    await setChatId(env, msg.chat.id);
  }

  const now = etNow();

  // Photo message → meal vision path. Works whether or not assessment is done.
  if (msg.photo && msg.photo.length > 0) {
    await handlePhoto(env, msg, now.date);
    return;
  }

  if (!msg.text) return;
  const text = msg.text.trim();
  if (!text) return;

  // /stats — send the chart pack on demand.
  if (text.toLowerCase() === "/stats" || text.toLowerCase() === "/charts") {
    const profile = await getProfile(env);
    if (profile.chat_id) {
      const sent = await sendStatsPack(env, profile.chat_id, profile);
      if (sent === 0) {
        await sendMessage(env, profile.chat_id, "Not enough data for charts yet. Keep logging.");
      }
    }
    return;
  }

  // Pending meal clarification? Resolve before anything else.
  const pendingResolved = await handlePendingClarification(env, text, msg.chat.id, now.date);
  if (pendingResolved) return;

  // Week-1 intake: route through the assessment flow until it's done.
  if (!profile0.assessment_complete) {
    const consumed = await handleAssessmentReply(env, text);
    if (consumed) return;
  }

  await ensureWeekSessions(env, now.weekStart);

  const logged = await parseAndLog(env, text, now.date, now.weekStart);
  await appendMessage(env, "user", text);

  // Rebuild context AFTER parsing so the prompt reflects the new values.
  const profile = await getProfile(env);
  if (!profile.chat_id) return;

  const [log, streak, weekRows] = await Promise.all([
    getDailyLog(env, now.date),
    getStreak(env),
    env.DB
      .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=? ORDER BY letter")
      .bind(now.weekStart)
      .all<{ letter: "A" | "B" | "C"; completed_date: string | null }>(),
  ]);

  const routine = pickRoutineForDate(now.date);
  const system = buildSystemPrompt({
    profile,
    today: now.date,
    log,
    streak,
    weekSessions: weekRows.results ?? [],
    pliabilityRoutine: `${routine.name}\n${routine.script}`,
  });

  const history = await recentMessages(env, 18);

  const loggedNote = logged.length
    ? `\n\n[system: auto-logged from his message — ${logged.join(", ")}]`
    : "";
  const lastUser = history[history.length - 1];
  if (lastUser && lastUser.role === "user" && loggedNote) {
    lastUser.content = lastUser.content + loggedNote;
  }

  await sendChatAction(env, profile.chat_id).catch(() => {});
  const reply = await chat(env, { system, messages: history, maxTokens: 700 });
  await sendMessage(env, profile.chat_id, reply);
  await appendMessage(env, "assistant", reply);
}
