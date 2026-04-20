import { decodeAction, stripAction } from "../buttons";
import { logCardio, logPliability, markMealLogged, markStrength } from "../db";
import { answerCallbackQuery, editReplyMarkup, type TgCallbackQuery } from "../telegram";
import { etNow } from "../time";
import type { Env } from "../types";

export async function handleCallback(env: Env, q: TgCallbackQuery): Promise<void> {
  if (!q.data || !q.message) {
    await answerCallbackQuery(env, q.id);
    return;
  }
  const action = decodeAction(q.data);
  if (!action) {
    await answerCallbackQuery(env, q.id);
    return;
  }

  const now = etNow();
  let toast = "Logged.";

  switch (action.kind) {
    case "pliability":
      await logPliability(env, now.date, 10);
      toast = "Pliability logged (10m).";
      break;
    case "strength": {
      const letter = action.letter
        ? (async () => {
            await env.DB
              .prepare(
                "UPDATE strength_session SET completed_date=? WHERE week_start=? AND letter=? AND completed_date IS NULL"
              )
              .bind(now.date, now.weekStart, action.letter)
              .run();
            return action.letter;
          })()
        : markStrength(env, now.weekStart, now.date);
      const marked = await letter;
      toast = marked ? `Strength session ${marked} closed.` : "No open strength session.";
      break;
    }
    case "cardio":
      await logCardio(env, now.date, action.minutes);
      toast = `Cardio logged (+${action.minutes}m).`;
      break;
    case "meal":
      await markMealLogged(env, now.date);
      toast = "Meal logged.";
      break;
  }

  const stripped = stripAction(q.message.reply_markup, q.data);
  await editReplyMarkup(env, q.message.chat.id, q.message.message_id, stripped);
  await answerCallbackQuery(env, q.id, toast);
}
