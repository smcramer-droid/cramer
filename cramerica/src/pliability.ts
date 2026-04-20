// 10-minute golf-pliability routines. Rotates daily. Each is a brief script
// the coach embeds into the morning check-in. Order is intentional: open
// the hips/t-spine before the wrist/forearm work; finish with balance + CARs.

export interface PliabilityRoutine {
  id: number;
  name: string;
  script: string;
}

export const ROUTINES: PliabilityRoutine[] = [
  {
    id: 1,
    name: "Hips & T-spine Opener",
    script: `2 min  — 90/90 hip switches, slow, 8/side
2 min  — World's greatest stretch + rotation, 4/side
2 min  — Open-books on the floor, 8/side, exhale into the reach
2 min  — Half-kneeling hip-flexor stretch with overhead reach, 6 breaths/side
2 min  — Cat/cow + thread-the-needle, relaxed tempo`,
  },
  {
    id: 2,
    name: "Rotational Prep",
    script: `2 min  — Deep squat hold, grab heels, rock side-to-side
2 min  — Standing hip circles + leg swings, 10 each direction
2 min  — Cable/band pull-aparts, slow, 15 reps
2 min  — Side-lying windmills, 6/side
2 min  — Torso twists in athletic stance, 10/side, controlled`,
  },
  {
    id: 3,
    name: "Grip & Forearm Flow",
    script: `2 min  — Wrist circles, both directions, 20 each
2 min  — Prayer stretch (fingers down) + reverse prayer (fingers up), alternate 30s holds
2 min  — Banded wrist flexion/extension, 15 reps each
2 min  — Forearm rolling (towel over club shaft, slow pronation/supination)
2 min  — Finger extensions vs. rubber band, 20 reps, 2 sets`,
  },
  {
    id: 4,
    name: "Posterior Chain & Balance",
    script: `2 min  — Single-leg RDL reach (bodyweight), 8/side, controlled
2 min  — Glute bridges with 3-second pause, 10 reps
2 min  — Bird dogs, slow, 8/side
2 min  — Single-leg balance w/ eyes closed, 30s × 2/side
2 min  — Standing figure-4 stretch, 45s/side`,
  },
  {
    id: 5,
    name: "Shoulder & Scap Wake-up",
    script: `2 min  — Wall slides, 10 reps, ribs down
2 min  — Band dislocates, slow, 10 reps
2 min  — Scap push-ups, 15 reps
2 min  — YTW raises (light DBs or bodyweight), 8 of each
2 min  — Thoracic CARs, big circles, 5/direction`,
  },
  {
    id: 6,
    name: "Full-Body Flow (light)",
    script: `2 min  — Inchworms with push-up, 6 reps
2 min  — Lateral lunges, 6/side
2 min  — Spider-man + reach, 5/side
2 min  — Deep squat to stand with overhead reach, 8 reps
2 min  — Standing cross-body arm swings, 20 total, finish relaxed`,
  },
  {
    id: 7,
    name: "Hips, Ankles, Feet",
    script: `2 min  — Ankle CARs + calf stretch against wall, 30s/side
2 min  — Toe yoga (toe spreading + single-toe lifts), 2 sets
2 min  — Cossack squats, 6/side
2 min  — 90/90 with forward fold, 30s hold/side
2 min  — Standing march w/ eyes closed, slow, 1 min × 2`,
  },
];

export function pickRoutineForDate(dateStr: string): PliabilityRoutine {
  // Simple day-of-year rotation; deterministic, wraps every 7 days.
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const dayIndex = Math.floor(t / 86400_000);
  return ROUTINES[dayIndex % ROUTINES.length]!;
}
