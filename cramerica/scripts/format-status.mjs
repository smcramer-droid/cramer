#!/usr/bin/env node
// Reads /admin/state JSON from stdin, prints a human-readable report.

const text = await new Promise((resolve) => {
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => resolve(s));
});

let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("Could not parse response as JSON. First 400 chars:");
  console.error(text.slice(0, 400));
  process.exit(1);
}

if (data.error) {
  console.error("Server returned error:", data);
  process.exit(1);
}

const useColor = process.stdout.isTTY;
const c = useColor
  ? { bold:(s)=>`\x1b[1m${s}\x1b[0m`, dim:(s)=>`\x1b[2m${s}\x1b[0m`, green:(s)=>`\x1b[32m${s}\x1b[0m`, red:(s)=>`\x1b[31m${s}\x1b[0m`, yellow:(s)=>`\x1b[33m${s}\x1b[0m`, cyan:(s)=>`\x1b[36m${s}\x1b[0m` }
  : { bold:(s)=>s, dim:(s)=>s, green:(s)=>s, red:(s)=>s, yellow:(s)=>s, cyan:(s)=>s };

const line = () => console.log(c.dim("─".repeat(48)));

console.log();
console.log(c.bold(c.cyan("◆ Cramerica")));
line();

if (data.et) {
  const h = Math.floor(data.et.minuteOfDay / 60);
  const m = data.et.minuteOfDay % 60;
  console.log(`${c.bold("Now:")} ${data.et.date} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} ET`);
}

if (data.profile) {
  const p = data.profile;
  const complete = p.assessment_complete === 1 ? c.green("complete") : c.red("incomplete");
  console.log(`${c.bold("Profile:")} ${p.weight_lbs ?? "—"} lbs · ${p.body_fat_pct ?? "—"}% BF · target ${p.target_bf_pct}% by ${p.target_date} · intake ${complete}`);
}
console.log();

if (data.today) {
  const t = data.today;
  const p = data.profile ?? {};
  const mark = (hit) => (hit ? c.green("✓") : c.dim("◻"));
  const proteinHit = (t.protein_g ?? 0) >= (p.protein_goal_g ?? 200);
  const calHit = t.calories != null && t.calories <= (p.calorie_cap ?? 1800);
  const cardioHit = (t.cardio_min ?? 0) >= (p.cardio_goal_min ?? 30);
  const pliaHit = (t.pliability_min ?? 0) >= (p.pliability_goal_min ?? 10);
  console.log(c.bold("Today:"));
  console.log(`  ${mark(proteinHit)} protein     ${t.protein_g ?? 0}/${p.protein_goal_g ?? 200} g`);
  console.log(`  ${mark(calHit)} calories    ${t.calories ?? "—"}/${p.calorie_cap ?? 1800}`);
  console.log(`  ${mark(cardioHit)} cardio      ${t.cardio_min ?? 0}/${p.cardio_goal_min ?? 30} min`);
  console.log(`  ${mark(pliaHit)} pliability  ${t.pliability_min ?? 0}/${p.pliability_goal_min ?? 10} min`);
} else {
  console.log(c.bold("Today:"), c.dim("no log yet"));
}
console.log();

if (Array.isArray(data.weekSessions) && data.weekSessions.length) {
  console.log(c.bold("Strength week:"));
  for (const s of data.weekSessions) {
    const state = s.completed_date
      ? c.green(`✓ done ${s.completed_date}`)
      : c.dim("◻ open");
    const planNote = s.has_plan ? "" : c.yellow(" (no plan yet)");
    console.log(`  ${s.letter}  ${state}${planNote}`);
  }
  console.log();
}

if (Array.isArray(data.recentErrors)) {
  if (data.recentErrors.length === 0) {
    console.log(c.bold("Errors:"), c.green("none"));
  } else {
    console.log(c.bold(c.red(`Recent errors (${data.recentErrors.length}):`)));
    for (const e of data.recentErrors.slice(0, 5)) {
      console.log(`  ${c.dim(e.created_at)}  ${c.bold(e.source)}`);
      console.log(`    ${c.red(e.message)}`);
      if (e.details) {
        const details = String(e.details).replace(/\s+/g, " ").slice(0, 300);
        console.log(c.dim(`    ${details}`));
      }
    }
  }
  console.log();
}

if (Array.isArray(data.recentMessages) && data.recentMessages.length) {
  console.log(c.bold("Recent messages:"));
  for (const m of data.recentMessages.slice().reverse()) {
    const who = m.role === "user" ? c.cyan("you") : c.dim("bot");
    const slot = m.slot ? c.dim(` [${m.slot}]`) : "";
    const clock = (m.created_at ?? "").slice(11, 16);
    const content = (m.content ?? "").replace(/\s+/g, " ").slice(0, 140);
    console.log(`  ${c.dim(clock)} ${who}${slot}  ${content}`);
  }
  console.log();
}

line();
console.log(c.dim("Tip: npm run status -- --section=messages --limit=50"));
console.log(c.dim("     npm run status -- --section=errors  --limit=20"));
console.log(c.dim("     npm run status -- --raw   (full JSON)"));
console.log();
