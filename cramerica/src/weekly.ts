import Anthropic from "@anthropic-ai/sdk";
import { client } from "./claude";
import { ensureWeekSessions } from "./db";
import type { Env, Profile } from "./types";

export interface WeeklyStats {
  window_start: string; // inclusive, 7 days back from today
  window_end: string;   // exclusive (today)
  days_logged: number;
  protein_hit_days: number;
  calories_hit_days: number;
  cardio_hit_days: number;
  pliability_hit_days: number;
  avg_protein_g: number | null;
  avg_calories: number | null;
  total_cardio_min: number;
  total_pliability_min: number;
  strength_pairs_closed: number;
  weight_delta_lbs: number | null;  // latest - oldest weigh-in in window
  adherence_pct: number;            // all 4 targets averaged across 7 days
}

export async function computeWeeklyStats(env: Env, today: string, profile: Profile, weekStart: string): Promise<WeeklyStats> {
  const start = shiftDate(today, -7);
  const end = today;

  const rows = await env.DB
    .prepare(
      `SELECT date, protein_g, calories, cardio_min, pliability_min, weight_lbs
       FROM daily_log WHERE date >= ? AND date < ? ORDER BY date ASC`
    )
    .bind(start, end)
    .all<{ date: string; protein_g: number; calories: number | null; cardio_min: number; pliability_min: number; weight_lbs: number | null }>();
  const logs = rows.results ?? [];

  let proteinHit = 0, caloriesHit = 0, cardioHit = 0, pliabilityHit = 0;
  let proteinSum = 0, proteinCount = 0;
  let calSum = 0, calCount = 0;
  let cardioTotal = 0, pliabilityTotal = 0;
  let firstWeight: number | null = null, lastWeight: number | null = null;

  for (const r of logs) {
    if (r.protein_g >= profile.protein_goal_g) proteinHit++;
    if (r.calories != null && r.calories <= profile.calorie_cap) caloriesHit++;
    if (r.cardio_min >= profile.cardio_goal_min) cardioHit++;
    if (r.pliability_min >= profile.pliability_goal_min) pliabilityHit++;
    if (r.protein_g > 0) { proteinSum += r.protein_g; proteinCount++; }
    if (r.calories != null) { calSum += r.calories; calCount++; }
    cardioTotal += r.cardio_min;
    pliabilityTotal += r.pliability_min;
    if (r.weight_lbs != null) {
      if (firstWeight == null) firstWeight = r.weight_lbs;
      lastWeight = r.weight_lbs;
    }
  }

  await ensureWeekSessions(env, weekStart);
  const ssRows = await env.DB
    .prepare("SELECT letter, completed_date FROM strength_session WHERE week_start=?")
    .bind(weekStart)
    .all<{ letter: string; completed_date: string | null }>();
  const pairsClosed = (ssRows.results ?? []).filter((s) => !!s.completed_date).length;

  const daysLogged = logs.length;
  const denom = Math.max(1, daysLogged * 4);
  const adherence = ((proteinHit + caloriesHit + cardioHit + pliabilityHit) / denom) * 100;

  return {
    window_start: start,
    window_end: end,
    days_logged: daysLogged,
    protein_hit_days: proteinHit,
    calories_hit_days: caloriesHit,
    cardio_hit_days: cardioHit,
    pliability_hit_days: pliabilityHit,
    avg_protein_g: proteinCount > 0 ? Math.round(proteinSum / proteinCount) : null,
    avg_calories: calCount > 0 ? Math.round(calSum / calCount) : null,
    total_cardio_min: cardioTotal,
    total_pliability_min: pliabilityTotal,
    strength_pairs_closed: pairsClosed,
    weight_delta_lbs: firstWeight != null && lastWeight != null ? Number((lastWeight - firstWeight).toFixed(1)) : null,
    adherence_pct: Math.round(adherence),
  };
}

export function formatWeeklyStatsForPrompt(s: WeeklyStats, profile: Profile): string {
  return `Last 7 days (${s.window_start} → ${s.window_end}):
- Days logged: ${s.days_logged}/7
- Protein ≥${profile.protein_goal_g}g: ${s.protein_hit_days}/${s.days_logged} days (avg ${s.avg_protein_g ?? "—"}g)
- Calories ≤${profile.calorie_cap}: ${s.calories_hit_days}/${s.days_logged} days (avg ${s.avg_calories ?? "—"})
- Cardio ≥${profile.cardio_goal_min}m: ${s.cardio_hit_days}/${s.days_logged} days (total ${s.total_cardio_min}m)
- Pliability ≥${profile.pliability_goal_min}m: ${s.pliability_hit_days}/${s.days_logged} days (total ${s.total_pliability_min}m)
- Strength pairs closed this week: ${s.strength_pairs_closed}/3
- Weight delta: ${s.weight_delta_lbs == null ? "no weigh-ins" : `${s.weight_delta_lbs > 0 ? "+" : ""}${s.weight_delta_lbs} lbs`}
- Overall adherence: ${s.adherence_pct}%`;
}

// ---- Weekly program regeneration ----

interface SessionPlanOut {
  letter: "A" | "B" | "C";
  focus: string;
  warmup: string;
  main: string[];
  finisher?: string;
}
interface RegenOutput {
  week_summary: string;
  week_sessions: SessionPlanOut[];
}

const REGEN_SCHEMA = {
  type: "object",
  required: ["week_summary", "week_sessions"],
  properties: {
    week_summary: { type: "string" },
    week_sessions: {
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
  },
};

export async function ensureWeekProgram(env: Env, weekStart: string, profile: Profile, today: string): Promise<void> {
  const existing = await env.DB
    .prepare("SELECT week_start FROM program WHERE week_start=?")
    .bind(weekStart)
    .first();
  if (existing) return;

  // Pull last week's stats + retro conversation for context.
  const stats = await computeWeeklyStats(env, today, profile, shiftDate(weekStart, -7));
  const prevProgramRow = await env.DB
    .prepare("SELECT plan_json, summary FROM program ORDER BY week_start DESC LIMIT 1")
    .first<{ plan_json: string; summary: string | null }>();
  const retroRows = await env.DB
    .prepare("SELECT role, content FROM message WHERE slot='sunday_retro' OR created_at >= datetime('now','-36 hours') ORDER BY created_at ASC LIMIT 40")
    .all<{ role: string; content: string }>();
  const retroText = (retroRows.results ?? []).map((m) => `${m.role}: ${m.content}`).join("\n");

  const system = `You are CRAMERICA's weekly program-design brain. Given last week's adherence, the retrospective conversation, and last week's sessions, produce THIS week's three strength sessions (A=Mon/Tue, B=Wed/Thu, C=Fri/Sat pairs) and a short week summary.

Principles:
- Progress the load/volume where adherence was strong and recovery was good.
- Pull back or simplify where he missed sessions or adherence was low.
- Keep rotational power + anti-rotation every week.
- Full gym primary; DB/band alternates for home days.
- The arc targets sub-${profile.target_bf_pct}% BF by ${profile.target_date}.

Respond with JSON ONLY via the emit_program tool.`;

  const user = `Weekly stats:
${formatWeeklyStatsForPrompt(stats, profile)}

Last week's sessions:
${prevProgramRow?.plan_json ?? "(none recorded)"}

Retro conversation (most recent):
${retroText.slice(-6000)}`;

  const anthropic = client(env);
  let parsed: RegenOutput | null = null;
  try {
    const resp = await anthropic.messages.create({
      model: env.CLAUDE_MODEL_WEEKLY,
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: "emit_program", description: "Emit the weekly program JSON.", input_schema: REGEN_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "emit_program" },
    });
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "emit_program") {
        parsed = block.input as RegenOutput;
        break;
      }
    }
  } catch (err) {
    console.error("weekly regen failed", err);
  }

  if (!parsed) return; // leave existing week-one default; retry next tick.

  await ensureWeekSessions(env, weekStart);
  for (const s of parsed.week_sessions) {
    await env.DB
      .prepare("UPDATE strength_session SET plan_json=? WHERE week_start=? AND letter=?")
      .bind(JSON.stringify(s), weekStart, s.letter)
      .run();
  }
  await env.DB
    .prepare("INSERT OR REPLACE INTO program (week_start, plan_json, summary) VALUES (?, ?, ?)")
    .bind(weekStart, JSON.stringify(parsed.week_sessions), parsed.week_summary)
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
