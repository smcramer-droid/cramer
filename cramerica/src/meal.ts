import Anthropic from "@anthropic-ai/sdk";
import { client } from "./claude";
import {
  appendMessage,
  getDailyLog,
  getProfile,
  logError,
  logProtein,
  markMealLogged,
  upsertDailyLog,
} from "./db";
import { fetchPhotoBytes, sendChatAction, sendMessage, type TgMessage } from "./telegram";
import { etNow } from "./time";
import type { Env } from "./types";

export interface MealEstimate {
  clear: boolean;
  dish_description: string;
  estimated_calories: number | null;
  estimated_protein_g: number | null;
  breakdown: string[];
  clarifying_question: string | null;
  confidence_notes: string;
}

const MEAL_TOOL_SCHEMA = {
  type: "object",
  required: [
    "clear",
    "dish_description",
    "estimated_calories",
    "estimated_protein_g",
    "breakdown",
    "clarifying_question",
    "confidence_notes",
  ],
  properties: {
    clear: {
      type: "boolean",
      description: "True only if the estimate is reasonably confident — components visible, portions estimable, no mystery ingredients. False if a clarifying question is needed.",
    },
    dish_description: {
      type: "string",
      description: "2–6 word description of the meal (e.g., 'grilled chicken + rice + broccoli').",
    },
    estimated_calories: { type: ["number", "null"] },
    estimated_protein_g: { type: ["number", "null"] },
    breakdown: {
      type: "array",
      items: { type: "string" },
      description: "Per-component estimates, e.g. 'chicken breast ~6 oz ≈ 270 cal / 50g protein'.",
    },
    clarifying_question: {
      type: ["string", "null"],
      description: "If clear=false, one short question to resolve the ambiguity. Otherwise null.",
    },
    confidence_notes: {
      type: "string",
      description: "Short (1 sentence) note on assumptions — serving size guessed from plate size, etc.",
    },
  },
};

const VISION_SYSTEM = `You are CRAMERICA's meal vision tool. Given a photo of a meal, estimate calories and protein.

Rules:
- Be honest about uncertainty. If portion size is ambiguous, state assumptions in confidence_notes.
- If you cannot see what's in the dish, or a major component is unidentifiable, set clear=false and ask ONE targeted clarifying question (e.g., "Is the white stuff rice or mashed potatoes?" or "Rough size of the chicken — palm-sized, deck-of-cards, bigger?").
- Call out protein sources specifically — Scott's goal is 200g/day.
- Don't lecture about macros. Just produce the estimate.
- Respond by calling the emit_meal tool. Do not produce prose.`;

async function arrayBufferToBase64(bytes: ArrayBuffer): Promise<string> {
  const bytesView = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytesView.length; i += chunk) {
    binary += String.fromCharCode(...bytesView.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function estimateFromPhoto(
  env: Env,
  fileId: string,
  userCaption?: string
): Promise<MealEstimate | null> {
  const photo = await fetchPhotoBytes(env, fileId);
  if (!photo) return null;
  const base64 = await arrayBufferToBase64(photo.bytes);

  const anthropic = client(env);
  try {
    const resp = await anthropic.messages.create({
      model: env.CLAUDE_MODEL_DAILY,
      max_tokens: 900,
      system: VISION_SYSTEM,
      tools: [{ name: "emit_meal", description: "Emit the structured meal estimate.", input_schema: MEAL_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "emit_meal" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: photo.mime as "image/jpeg" | "image/png", data: base64 },
            },
            {
              type: "text",
              text: userCaption && userCaption.trim()
                ? `Photo caption from user: "${userCaption.trim()}". Estimate calories and protein.`
                : "Estimate calories and protein for this meal.",
            },
          ],
        },
      ],
    });
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "emit_meal") {
        return block.input as MealEstimate;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("vision call failed", err);
    await logError(env, "meal.vision", msg, { model: env.CLAUDE_MODEL_DAILY });
  }
  return null;
}

export async function estimateFromClarification(
  env: Env,
  priorDescription: string,
  priorQuestion: string,
  userReply: string,
  priorCalories: number | null,
  priorProtein: number | null
): Promise<MealEstimate | null> {
  const anthropic = client(env);
  const system = `You're CRAMERICA's meal-resolver. A prior photo analysis wasn't confident and you asked a clarifying question. Now the user has answered. Produce a final estimate. If the answer still leaves a major ambiguity, you may stay clear=false and ask ONE more short question, but strongly prefer producing a usable estimate.`;
  const user = `Prior dish description: "${priorDescription}"
Prior calorie estimate: ${priorCalories ?? "unset"}
Prior protein estimate: ${priorProtein ?? "unset"}
Clarifying question I asked: "${priorQuestion}"
User's answer: "${userReply}"

Produce the final estimate via emit_meal.`;

  try {
    const resp = await anthropic.messages.create({
      model: env.CLAUDE_MODEL_DAILY,
      max_tokens: 700,
      system,
      tools: [{ name: "emit_meal", description: "Emit the structured meal estimate.", input_schema: MEAL_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "emit_meal" },
      messages: [{ role: "user", content: user }],
    });
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "emit_meal") {
        return block.input as MealEstimate;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("clarification vision call failed", err);
    await logError(env, "meal.clarification", msg, { model: env.CLAUDE_MODEL_DAILY });
  }
  return null;
}

// ---- Text-based meal logging (natural language, not photos) ----

const TEXT_MEAL_SYSTEM = `You are CRAMERICA's meal-text parser. Given a user's text, decide if it describes food they ate/are eating/plan to eat right now. If yes, estimate calories and protein.

Be BROAD. The user hates being nagged for clarifications. Default to making a reasonable estimate using standard portions when the user is vague.

Common defaults when size isn't stated:
- Chicken breast: 6 oz cooked ≈ 280 cal / 50g protein
- Ground beef 85/15: 4 oz cooked ≈ 240 cal / 22g protein
- Egg (1 whole large): 70 cal / 6g protein
- Rice cooked (1 cup): 200 cal / 4g protein
- Protein shake/scoop: ~120 cal / 25g protein
- Oatmeal (1 cup cooked): 160 cal / 5g protein
- Slice of bread: 80 cal / 3g protein
- 1 tbsp peanut butter: 95 cal / 4g protein
- Banana (medium): 105 cal / 1g protein
- Salmon filet: 6 oz ≈ 300 cal / 40g protein
- Greek yogurt (7 oz): 130 cal / 18g protein

Rules:
- If text clearly describes food/meal consumption (e.g., "6 oz chicken", "had eggs and rice", "protein shake", "ate a steak"): clear=true, produce estimates. Put assumed portions in confidence_notes so the user can correct.
- If text is a PURE macro report ("180g protein so far", "hit 1600 cal"): set dish_description="macro report" and estimates to null (the regex parser handles those — we don't want to double-log).
- If text is NOT about food at all ("how's it going", "thanks", questions): set dish_description="not a food log" and estimates to null. The caller will skip logging.
- Only set clear=false if the user explicitly describes food but a critical piece is missing AND a reasonable default doesn't exist (rare). Ask ONE short question.
- Multiple items in one message: aggregate into a single total.
- When the user gives a specific weight/size, honor it exactly.

Always call the emit_meal tool with your structured result. No prose.`;

export async function estimateFromText(env: Env, text: string): Promise<MealEstimate | null> {
  const anthropic = client(env);
  try {
    const resp = await anthropic.messages.create({
      model: env.CLAUDE_MODEL_DAILY,
      max_tokens: 700,
      system: TEXT_MEAL_SYSTEM,
      tools: [{ name: "emit_meal", description: "Emit the structured meal estimate.", input_schema: MEAL_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "emit_meal" },
      messages: [{ role: "user", content: text }],
    });
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "emit_meal") {
        return block.input as MealEstimate;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("text meal estimate failed", err);
    await logError(env, "meal.text", msg, { model: env.CLAUDE_MODEL_DAILY });
  }
  return null;
}

const FOOD_HINTS = /\b(ate|eaten|eat|eating|had|having|drink|drank|drinking|breakfast|lunch|dinner|snack|meal|meals|food|protein|calorie|cals?|chicken|beef|steak|egg|eggs|pork|turkey|salmon|tuna|fish|rice|pasta|bread|toast|oatmeal|oats|yogurt|shake|smoothie|nuts|almond|cheese|bacon|sausage|milk|coffee|salad|veggies?|vegetable|broccoli|spinach|banana|apple|berries|fruit|oz|ounce|grams?|\bg\b|cup|tbsp|tsp|serving|plate|bowl|scoop|piece|slice)\b/i;

export function looksFoodish(text: string): boolean {
  if (text.length < 3) return false;
  if (text.startsWith("/")) return false;
  return FOOD_HINTS.test(text);
}

// ---- Pending meal state ----

export interface PendingMeal {
  id: number;
  file_id: string | null;
  dish_description: string | null;
  estimated_calories: number | null;
  estimated_protein_g: number | null;
  clarifying_question: string | null;
  created_at: string;
}

const PENDING_TTL_MINUTES = 30;

export async function getPending(env: Env): Promise<PendingMeal | null> {
  const row = await env.DB
    .prepare(
      `SELECT id, file_id, dish_description, estimated_calories, estimated_protein_g, clarifying_question, created_at
       FROM pending_meal ORDER BY id DESC LIMIT 1`
    )
    .first<PendingMeal>();
  if (!row) return null;
  const ageMinutes = (Date.now() - Date.parse(row.created_at + "Z")) / 60000;
  if (ageMinutes > PENDING_TTL_MINUTES) {
    await env.DB.prepare("DELETE FROM pending_meal WHERE id=?").bind(row.id).run();
    return null;
  }
  return row;
}

export async function savePending(env: Env, m: MealEstimate, fileId: string | null): Promise<void> {
  await env.DB.prepare("DELETE FROM pending_meal").run(); // only one active pending
  await env.DB
    .prepare(
      `INSERT INTO pending_meal (file_id, dish_description, estimated_calories, estimated_protein_g, clarifying_question)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      fileId,
      m.dish_description,
      m.estimated_calories,
      m.estimated_protein_g,
      m.clarifying_question
    )
    .run();
}

export async function clearPending(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM pending_meal").run();
}

export async function commitEstimate(env: Env, estimate: MealEstimate, date: string): Promise<void> {
  await upsertDailyLog(env, date);
  if (estimate.estimated_calories != null) {
    // Additive for multiple meals in a day.
    await env.DB.prepare(
      "UPDATE daily_log SET calories = COALESCE(calories,0) + ?, updated_at=datetime('now') WHERE date=?"
    ).bind(estimate.estimated_calories, date).run();
  }
  if (estimate.estimated_protein_g != null) {
    await logProtein(env, date, estimate.estimated_protein_g);
  }
  await markMealLogged(env, date);
}

// Single source of truth for the post-log tally line. Used after every
// meal commit so the user can see running totals match their mental picture.
export async function formatRunningTally(env: Env, date: string): Promise<string> {
  const [log, profile] = await Promise.all([getDailyLog(env, date), getProfile(env)]);
  const cal = log.calories ?? 0;
  const mealWord = log.meals_logged === 1 ? "meal" : "meals";
  return `*Today: ${log.protein_g}/${profile.protein_goal_g}g protein · ${cal}/${profile.calorie_cap} cal · ${log.meals_logged} ${mealWord}*`;
}

export function formatEstimate(e: MealEstimate): string {
  const lines: string[] = [];
  lines.push(`*${e.dish_description}*`);
  if (e.estimated_calories != null || e.estimated_protein_g != null) {
    lines.push(`≈ ${e.estimated_calories ?? "?"} cal · ${e.estimated_protein_g ?? "?"}g protein`);
  }
  if (e.breakdown.length) {
    lines.push("");
    for (const b of e.breakdown) lines.push(`• ${b}`);
  }
  if (e.confidence_notes) lines.push(`\n_${e.confidence_notes}_`);
  return lines.join("\n");
}

// Entry point: a message arrived that has a photo.
export async function handlePhoto(env: Env, msg: TgMessage, date: string): Promise<boolean> {
  if (!msg.photo || msg.photo.length === 0) return false;
  const chatId = msg.chat.id;
  // Pick largest photo (highest resolution available to the bot).
  const largest = msg.photo.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  await sendChatAction(env, chatId);
  const estimate = await estimateFromPhoto(env, largest.file_id, msg.caption);
  if (!estimate) {
    await sendMessage(env, chatId, "Couldn't read that photo clearly. Mind describing the meal in text?");
    return true;
  }

  if (estimate.clear) {
    await commitEstimate(env, estimate, date);
    const tally = await formatRunningTally(env, date);
    const body = `Logged.\n\n${formatEstimate(estimate)}\n\n${tally}\n\nIf the estimate's off, reply with the correction (e.g., "that was 8oz chicken not 6").`;
    await sendMessage(env, chatId, body);
    await appendMessage(env, "assistant", `[meal logged] ${formatEstimate(estimate)}\n\n${tally}`);
  } else {
    await savePending(env, estimate, largest.file_id);
    const ask =
      estimate.clarifying_question ??
      "Could you tell me roughly what's in it and how big the serving is?";
    const preview = estimate.dish_description ? `Looks like: *${estimate.dish_description}*.\n\n` : "";
    await sendMessage(env, chatId, `${preview}${ask}`);
    await appendMessage(env, "assistant", `[meal pending] ${ask}`);
  }
  return true;
}

// Attempt to log a meal from natural-language text. Returns:
//   "logged"       — estimate was logged silently; coach reply should still run
//                    with the log added to context so the coach can acknowledge
//   "asked"        — we sent a clarifying question; caller should SKIP coaching
//   "not_food"     — no food detected; caller proceeds normally
//   "skip"         — macro report or other — caller proceeds normally
export async function handleTextMeal(
  env: Env,
  text: string,
  chatId: number,
  date: string
): Promise<{ status: "logged" | "asked" | "not_food" | "skip"; summary?: string }> {
  if (!looksFoodish(text)) return { status: "not_food" };
  await sendChatAction(env, chatId);
  const est = await estimateFromText(env, text);
  if (!est) return { status: "not_food" };

  const desc = (est.dish_description ?? "").toLowerCase();
  if (desc.includes("not a food") || desc.includes("macro report")) {
    return { status: "skip" };
  }

  if (est.clear && (est.estimated_calories != null || est.estimated_protein_g != null)) {
    await commitEstimate(env, est, date);
    return { status: "logged", summary: formatEstimate(est) };
  }

  if (!est.clear && est.clarifying_question) {
    await savePending(env, est, null);
    const ask = est.clarifying_question;
    const preview = est.dish_description ? `Got *${est.dish_description}*.\n\n` : "";
    await sendMessage(env, chatId, `${preview}${ask}`);
    await appendMessage(env, "assistant", `[meal pending] ${ask}`);
    return { status: "asked" };
  }

  return { status: "skip" };
}

// Entry point: a text message arrived while a pending meal is awaiting clarification.
// Returns true if we consumed the message (don't also run normal coaching).
export async function handlePendingClarification(env: Env, text: string, chatId: number, date: string): Promise<boolean> {
  const pending = await getPending(env);
  if (!pending) return false;

  await sendChatAction(env, chatId);
  const refined = await estimateFromClarification(
    env,
    pending.dish_description ?? "(unknown)",
    pending.clarifying_question ?? "",
    text,
    pending.estimated_calories,
    pending.estimated_protein_g
  );

  if (!refined) {
    // Give up gracefully — stash what we had, let user text-log.
    await clearPending(env);
    await sendMessage(env, chatId, "Couldn't lock it in from that. Reply with calories/protein directly (e.g., '600 cal, 45g protein') and I'll log it.");
    return true;
  }

  if (refined.clear || refined.estimated_calories != null || refined.estimated_protein_g != null) {
    await commitEstimate(env, refined, date);
    await clearPending(env);
    const tally = await formatRunningTally(env, date);
    await sendMessage(env, chatId, `Logged.\n\n${formatEstimate(refined)}\n\n${tally}`);
    await appendMessage(env, "assistant", `[meal logged] ${formatEstimate(refined)}\n\n${tally}`);
  } else {
    // Still ambiguous — ask once more, but don't loop forever.
    await savePending(env, refined, pending.file_id);
    await sendMessage(env, chatId, refined.clarifying_question ?? "Rough calories and protein for it?");
  }
  return true;
}
