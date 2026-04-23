import type { Env, Profile } from "./types";
import { sendPhoto } from "./telegram";

// Renders via QuickChart.io — Chart.js config JSON → PNG URL. No auth
// required, no deps. Data sent: numeric values only (no names, no text
// identifying Scott). Swap this module out if you'd rather self-host.

const QC = "https://quickchart.io/chart";

function qcUrl(config: unknown, width = 720, height = 400): string {
  const json = JSON.stringify(config);
  const params = new URLSearchParams({
    c: json,
    w: String(width),
    h: String(height),
    bkg: "white",
    devicePixelRatio: "2",
  });
  return `${QC}?${params.toString()}`;
}

interface DayPoint {
  date: string;
  protein_g: number;
  calories: number | null;
  cardio_min: number;
  pliability_min: number;
  faith_done: number;
  weight_lbs: number | null;
}

async function fetchRecentLogs(env: Env, days: number): Promise<DayPoint[]> {
  const rows = await env.DB
    .prepare(
      `SELECT date, protein_g, calories, cardio_min, pliability_min, faith_done, weight_lbs
       FROM daily_log ORDER BY date DESC LIMIT ?`
    )
    .bind(days)
    .all<DayPoint>();
  return (rows.results ?? []).reverse();
}

// ---- Chart builders ----

export async function weightTrendChart(env: Env, days = 28): Promise<string | null> {
  const logs = await fetchRecentLogs(env, days);
  const points = logs.filter((l) => l.weight_lbs != null) as Array<DayPoint & { weight_lbs: number }>;
  if (points.length < 2) return null;
  const config = {
    type: "line",
    data: {
      labels: points.map((p) => p.date.slice(5)),
      datasets: [
        {
          label: "Weight (lbs)",
          data: points.map((p) => p.weight_lbs),
          borderColor: "rgb(36, 99, 235)",
          backgroundColor: "rgba(36, 99, 235, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Weight — last 4 weeks" } },
      scales: { y: { ticks: { precision: 1 } } },
    },
  };
  return qcUrl(config);
}

export async function dailyAdherenceChart(env: Env, profile: Profile, days = 7): Promise<string | null> {
  const logs = await fetchRecentLogs(env, days);
  if (logs.length === 0) return null;
  const proteinHit = logs.map((l) => (l.protein_g >= profile.protein_goal_g ? 1 : 0));
  const calHit = logs.map((l) => (l.calories != null && l.calories <= profile.calorie_cap ? 1 : 0));
  const cardioHit = logs.map((l) => (l.cardio_min >= profile.cardio_goal_min ? 1 : 0));
  const pliaHit = logs.map((l) => (l.pliability_min >= profile.pliability_goal_min ? 1 : 0));
  const faithHit = logs.map((l) => (Number(l.faith_done) === 1 ? 1 : 0));

  const config = {
    type: "bar",
    data: {
      labels: logs.map((l) => l.date.slice(5)),
      datasets: [
        { label: "Protein", data: proteinHit, backgroundColor: "rgba(16, 185, 129, 0.8)" },
        { label: "Calories", data: calHit, backgroundColor: "rgba(245, 158, 11, 0.8)" },
        { label: "Cardio", data: cardioHit, backgroundColor: "rgba(59, 130, 246, 0.8)" },
        { label: "Pliability", data: pliaHit, backgroundColor: "rgba(147, 51, 234, 0.8)" },
        { label: "Faith", data: faithHit, backgroundColor: "rgba(244, 63, 94, 0.8)" },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Daily streak gates hit — last 7 days" } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, max: 5, ticks: { stepSize: 1 } },
      },
    },
  };
  return qcUrl(config);
}

export async function weeklyVolumeChart(env: Env, days = 7): Promise<string | null> {
  const logs = await fetchRecentLogs(env, days);
  if (logs.length === 0) return null;
  const config = {
    type: "line",
    data: {
      labels: logs.map((l) => l.date.slice(5)),
      datasets: [
        {
          label: "Protein (g)",
          data: logs.map((l) => l.protein_g),
          borderColor: "rgb(16, 185, 129)",
          yAxisID: "y1",
          tension: 0.3,
        },
        {
          label: "Calories",
          data: logs.map((l) => l.calories ?? null),
          borderColor: "rgb(245, 158, 11)",
          yAxisID: "y2",
          spanGaps: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Protein + calories — last 7 days" } },
      scales: {
        y1: { type: "linear", position: "left", title: { display: true, text: "Protein (g)" } },
        y2: { type: "linear", position: "right", title: { display: true, text: "Calories" }, grid: { drawOnChartArea: false } },
      },
    },
  };
  return qcUrl(config);
}

export async function strengthWeeksChart(env: Env, weeks = 6): Promise<string | null> {
  const rows = await env.DB
    .prepare(
      `SELECT week_start, SUM(CASE WHEN completed_date IS NOT NULL THEN 1 ELSE 0 END) AS closed
       FROM strength_session GROUP BY week_start ORDER BY week_start DESC LIMIT ?`
    )
    .bind(weeks)
    .all<{ week_start: string; closed: number }>();
  const list = (rows.results ?? []).reverse();
  if (list.length === 0) return null;
  const config = {
    type: "bar",
    data: {
      labels: list.map((r) => r.week_start.slice(5)),
      datasets: [
        {
          label: "Strength sessions",
          data: list.map((r) => r.closed),
          backgroundColor: "rgba(36, 99, 235, 0.8)",
        },
      ],
    },
    options: {
      plugins: { title: { display: true, text: "Strength sessions closed — last 6 weeks" } },
      scales: { y: { max: 3, ticks: { stepSize: 1 } } },
    },
  };
  return qcUrl(config);
}

// Top-level: send a pack of charts to the user.
export async function sendStatsPack(env: Env, chatId: number, profile: Profile): Promise<number> {
  let sent = 0;
  const adherence = await dailyAdherenceChart(env, profile);
  if (adherence) {
    await sendPhoto(env, chatId, adherence, "Streak gates hit (of 5) — last 7 days. Protein / calories / cardio / pliability / faith.");
    sent++;
  }
  const volume = await weeklyVolumeChart(env);
  if (volume) {
    await sendPhoto(env, chatId, volume, "Protein and calories — last 7 days.");
    sent++;
  }
  const weight = await weightTrendChart(env);
  if (weight) {
    await sendPhoto(env, chatId, weight, "Weight trend — last 4 weeks.");
    sent++;
  }
  const strength = await strengthWeeksChart(env);
  if (strength) {
    await sendPhoto(env, chatId, strength, "Strength sessions closed — last 6 weeks.");
    sent++;
  }
  return sent;
}
