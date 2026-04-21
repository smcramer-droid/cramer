export interface Env {
  DB: D1Database;
  PROGRAM_GEN: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY: string;
  TIMEZONE: string;
  TARGET_DATE: string;
  CLAUDE_MODEL_DAILY: string;
  CLAUDE_MODEL_WEEKLY: string;
}

export type Slot = "morning" | "midday" | "evening" | "sunday_retro";

export interface Kid {
  name: string;
  age: number;
}

export interface Profile {
  chat_id: number | null;
  wife_name: string;
  kids: Kid[];
  weight_lbs: number | null;
  body_fat_pct: number | null;
  age: number | null;
  height_in: number | null;
  handicap: number | null;
  target_date: string;
  target_bf_pct: number;
  protein_goal_g: number;
  calorie_cap: number;
  cardio_goal_min: number;
  pliability_goal_min: number;
  assessment_complete: boolean;
}

export interface DailyLog {
  date: string;
  protein_g: number;
  calories: number | null;
  cardio_min: number;
  pliability_min: number;
  meals_logged: number;
  weight_lbs: number | null;
  notes: string | null;
}

export interface StrengthSession {
  week_start: string;
  letter: "A" | "B" | "C";
  plan_json: string | null;
  completed_date: string | null;
  notes: string | null;
}

export interface Streak {
  daily_count: number;
  daily_best: number;
  week_count: number;
  week_best: number;
}
