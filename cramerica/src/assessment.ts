import Anthropic from "@anthropic-ai/sdk";
import { client } from "./claude";
import { appendMessage, ensureWeekSessions, getProfile } from "./db";
import { sendChatAction, sendMessage } from "./telegram";
import { etNow } from "./time";
import type { Env } from "./types";

// Week-1 intake. One question at a time; answers persisted to `assessment`.
// When the last answer lands, Opus distills structured fields + generates
// the first week's 3 sessions, then flips profile.assessment_complete=1.

export const QUESTIONS: { key: string; prompt: string }[] = [
  { key: "open", prompt:
    "Let's start. This is the week-1 intake — I'll ask 10 things, you answer however you want, and I'll build your program from your answers. Ready? First: give me a one-line read on where you're at right now. How do you feel physically, and what's the single thing you want to change most over the next 7 weeks?" },
  { key: "weight", prompt: "Current weight in pounds?" },
  { key: "body_fat", prompt: "Best estimate of your body fat % right now? If you don't know, say your gut guess — 'mid-twenties,' 'around 22,' whatever. We'll tighten it over time." },
  { key: "age_height", prompt: "Age and height?" },
  { key: "handicap", prompt: "Golf handicap, roughly? And how often are you playing these days?" },
  { key: "training_history", prompt: "Quick training history. How many years lifting, how consistent the last 6 months, and what movements feel strong vs. rusty right now?" },
  { key: "baseline_lifts", prompt: "Rough working weights you can hit today for: goblet or back squat (8 reps), DB bench press (8 reps), DB row (10 reps), DB Romanian deadlift (8 reps). Estimate — we'll calibrate fast in week 1." },
  { key: "equipment", prompt: "You told me you have a full gym, home rack, DBs + bands, and bodyweight — is that all still true, and where will most of your sessions happen?" },
  { key: "schedule", prompt: "What does a typical weekday look like — wake time, when's the training window, when's the hard part (meetings, school pickup, etc.)?" },
  { key: "injuries_focus", prompt: "Last one. Anything to avoid — old injuries, aches, movements that don't love you? And if you had to pick one physical goal beyond body fat for these 7 weeks (e.g., a cleaner rotation, harder ball striking, bigger squat, more conditioning), what is it?" },
];

export async function assessmentProgress(env: Env): Promise<{ answered: number; total: number }> {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM assessment")
    .first<{ n: number }>();
  return { answered: row?.n ?? 0, total: QUESTIONS.length };
}

export async function nextQuestion(env: Env): Promise<string | null> {
  const { answered, total } = await assessmentProgress(env);
  if (answered >= total) return null;
  return QUESTIONS[answered]!.prompt;
}

export async function sendFirstQuestion(env: Env, chatId: number): Promise<void> {
  const { answered } = await assessmentProgress(env);
  const q = await nextQuestion(env);
  if (!q) return;
  const text = answered === 0
    ? "Morning. Before I start coaching, I need to know who I'm coaching. This is the week-1 intake — 10 questions, conversational, go at your pace.\n\n" + q
    : "Picking up where we left off.\n\n" + q;
  await sendMessage(env, chatId, text);
  await appendMessage(env, "assistant", text, "morning");
}

// Handle an incoming user message while assessment is in flight.
// Returns true if this message was consumed by the assessment flow.
export async function handleAssessmentReply(env: Env, text: string): Promise<boolean> {
  const profile = await getProfile(env);
  if (profile.assessment_complete) return false;

  const { answered, total } = await assessmentProgress(env);
  if (answered >= total) return false;

  const current = QUESTIONS[answered]!;
  await appendMessage(env, "user", text);
  await env.DB
    .prepare("INSERT INTO assessment (question, answer) VALUES (?, ?)")
    .bind(current.prompt, text)
    .run();

  const nextIdx = answered + 1;
  if (nextIdx < total) {
    const q = QUESTIONS[nextIdx]!.prompt;
    if (profile.chat_id) {
      await sendMessage(env, profile.chat_id, q);
      await appendMessage(env, "assistant", q);
    }
    return true;
  }

  // Final answer received — distill + generate week 1 program.
  if (profile.chat_id) {
    await sendChatAction(env, profile.chat_id);
    await sendMessage(
      env,
      profile.chat_id,
      "Got it. Give me a minute — I'm writing your week-1 program and locking in your profile."
    );
  }
  await finalizeAssessment(env);
  return true;
}

interface DistilledProfile {
  weight_lbs: number | null;
  body_fat_pct: number | null;
  age: number | null;
  height_in: number | null;
  handicap: number | null;
}
interface WeekPlan {
  letter: "A" | "B" | "C";
  focus: string;
  warmup: string;
  main: string[];
  finisher?: string;
}
interface WeeklyProgramOutput {
  profile: DistilledProfile;
  seven_week_arc: string;
  week_1: WeekPlan[];
  coach_summary: string;
}

async function finalizeAssessment(env: Env): Promise<void> {
  const rows = await env.DB
    .prepare("SELECT question, answer FROM assessment ORDER BY id")
    .all<{ question: string; answer: string }>();
  const qa = (rows.results ?? []).map((r) => `Q: ${r.question}\nA: ${r.answer}`).join("\n\n");

  const system = `You are CRAMERICA's program-design brain. You take intake answers and produce: (1) a concise 7-week arc for sub-15% body fat + golf-strength performance, (2) this week's 3 strength sessions (A=Mon/Tue pair, B=Wed/Thu pair, C=Fri/Sat pair), (3) an extracted structured profile.

Design principles:
- Week 1 is assessment-friendly RPE 6–7 — build tolerance, nail movement patterns. Weight loads should match or slightly underweight the user's stated baseline working weights.
- Rotational power (med ball throws, cable chops), anti-rotation (Pallof, side plank) show up every week.
- Full gym + home rack available; program for the gym but provide a DB/band swap for home days.
- Sub-15% BF requires a ~500 cal/day deficit at 200g protein — program energy cost matches but doesn't crush recovery.
- Golf-relevant patterns: hinge, rotation, anti-rotation, single-leg, overhead stability.

Respond with JSON ONLY, matching this shape exactly. No prose outside the JSON.`;

  const user = `Intake answers:

${qa}

Now produce the JSON.`;

  const schema = {
    type: "object",
    required: ["profile", "seven_week_arc", "week_1", "coach_summary"],
    properties: {
      profile: {
        type: "object",
        properties: {
          weight_lbs: { type: ["number", "null"] },
          body_fat_pct: { type: ["number", "null"] },
          age: { type: ["number", "null"] },
          height_in: { type: ["number", "null"] },
          handicap: { type: ["number", "null"] },
        },
        required: ["weight_lbs", "body_fat_pct", "age", "height_in", "handicap"],
      },
      seven_week_arc: { type: "string" },
      week_1: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          required: ["letter", "focus", "warmup", "main"],
          properties: {
            letter: { enum: ["A", "B", "C"] },
            focus: { type: "string" },
            warmup: { type: "string" },
            main: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 7 },
            finisher: { type: "string" },
          },
        },
      },
      coach_summary: { type: "string" },
    },
  };

  const anthropic = client(env);
  let parsed: WeeklyProgramOutput | null = null;
  try {
    const resp = await anthropic.messages.create({
      model: env.CLAUDE_MODEL_WEEKLY,
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: "emit_program", description: "Emit the structured program JSON.", input_schema: schema as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "emit_program" },
    });
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "emit_program") {
        parsed = block.input as WeeklyProgramOutput;
        break;
      }
    }
  } catch (err) {
    console.error("assessment finalize Opus call failed", err);
  }

  const now = etNow();
  const profile = await getProfile(env);

  if (parsed) {
    const p = parsed.profile;
    await env.DB.prepare(
      "UPDATE profile SET weight_lbs=COALESCE(?, weight_lbs), body_fat_pct=COALESCE(?, body_fat_pct), age=COALESCE(?, age), height_in=COALESCE(?, height_in), handicap=COALESCE(?, handicap), assessment_complete=1, updated_at=datetime('now') WHERE id=1"
    ).bind(p.weight_lbs, p.body_fat_pct, p.age, p.height_in, p.handicap).run();

    await ensureWeekSessions(env, now.weekStart);
    for (const s of parsed.week_1) {
      await env.DB.prepare(
        "UPDATE strength_session SET plan_json=? WHERE week_start=? AND letter=?"
      ).bind(JSON.stringify(s), now.weekStart, s.letter).run();
    }
    await env.DB.prepare(
      "INSERT OR REPLACE INTO program (week_start, plan_json, summary) VALUES (?, ?, ?)"
    ).bind(now.weekStart, JSON.stringify(parsed.week_1), parsed.seven_week_arc).run();

    if (profile.chat_id) {
      const summary = formatProgramSummary(parsed);
      await sendMessage(env, profile.chat_id, summary);
      await appendMessage(env, "assistant", summary);
    }
  } else {
    // Fallback: mark complete; use default program already seeded.
    await env.DB.prepare(
      "UPDATE profile SET assessment_complete=1, updated_at=datetime('now') WHERE id=1"
    ).run();
    if (profile.chat_id) {
      const msg = "Program generation hit a snag. I'll use the week-1 default and we'll regenerate next Sunday. Onward.";
      await sendMessage(env, profile.chat_id, msg);
      await appendMessage(env, "assistant", msg);
    }
  }
}

function formatProgramSummary(p: WeeklyProgramOutput): string {
  const lines: string[] = [];
  lines.push("*Week 1 is locked in.*");
  lines.push("");
  lines.push(p.coach_summary);
  lines.push("");
  lines.push("*7-week arc:*");
  lines.push(p.seven_week_arc);
  lines.push("");
  for (const s of p.week_1) {
    lines.push(`*Session ${s.letter} — ${s.focus}*`);
    lines.push(`_Warm-up:_ ${s.warmup}`);
    for (const m of s.main) lines.push(`• ${m}`);
    if (s.finisher) lines.push(`_Finisher:_ ${s.finisher}`);
    lines.push("");
  }
  lines.push("I'll see you in the morning.");
  return lines.join("\n");
}
