// Strength program skeleton. Opus 4.7 will be asked to personalize this each
// Sunday retro based on the previous week's logs + assessment answers. For
// week 1 we seed a sensible default so the first sessions exist before the
// coach has enough data to personalize.

export interface SessionPlan {
  letter: "A" | "B" | "C";
  focus: string;
  warmup: string;
  main: string[];      // movement blocks
  finisher?: string;
}

export const WEEK_ONE_DEFAULT: SessionPlan[] = [
  {
    letter: "A",
    focus: "Lower + rotational power (assessment-friendly)",
    warmup: "Pliability routine + 5 min easy bike",
    main: [
      "Goblet squat — 3 × 8 @ RPE 6 (find working weight)",
      "Trap-bar or DB Romanian deadlift — 3 × 8 @ RPE 6",
      "Reverse lunge — 2 × 8/side",
      "Med-ball rotational throw — 3 × 5/side, all-out",
      "Pallof press — 3 × 10/side",
    ],
    finisher: "5 min zone-2 bike",
  },
  {
    letter: "B",
    focus: "Upper push/pull + anti-rotation",
    warmup: "Pliability routine + band shoulder prep",
    main: [
      "DB bench press — 3 × 8 @ RPE 6",
      "1-arm DB row — 3 × 10/side",
      "Half-kneeling landmine press — 3 × 8/side",
      "Cable/band face pull — 3 × 15",
      "Side plank w/ reach — 3 × 30s/side",
    ],
    finisher: "Farmer carry — 3 × 40 steps",
  },
  {
    letter: "C",
    focus: "Full-body power + conditioning",
    warmup: "Pliability routine + 5 min easy row",
    main: [
      "Kettlebell swing — 5 × 10",
      "Front squat or goblet squat — 3 × 6 @ RPE 7",
      "Chin-up or lat pulldown — 3 × 6-8",
      "Rotational cable chop — 3 × 10/side",
      "Dead bug — 3 × 10/side, slow",
    ],
    finisher: "10 min mixed intervals (30s hard / 30s easy on bike or rower)",
  },
];

export function sessionPlanToText(p: SessionPlan): string {
  const lines = [
    `*Session ${p.letter} — ${p.focus}*`,
    ``,
    `*Warm-up*: ${p.warmup}`,
    ``,
    `*Main:*`,
    ...p.main.map((m) => `• ${m}`),
  ];
  if (p.finisher) {
    lines.push(``, `*Finisher*: ${p.finisher}`);
  }
  return lines.join("\n");
}
