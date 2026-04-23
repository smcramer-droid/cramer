import type { Slot } from "../types";

// These are the "coach, please produce the check-in" directives.
// The system prompt already has all context; these just tell Claude which
// check-in type to write this turn.

export function checkinDirective(slot: Slot): string {
  switch (slot) {
    case "morning":
      return `Write the MORNING check-in for today.

Must include, in your own voice:
1. Open with the current streak + a short anchor — why today matters (family, faith, the target date).
2. Today's strength session plan (if any) — letter A/B/C, day-pair, the session focus. If the pair is already closed, note the optional "stack day" and move on.
3. Today's 10-minute pliability protocol (already listed in system prompt — translate it into a tight readable block).
4. The day's 5 streak gates as a simple checklist the user can reply-log against: protein, calories, cardio, pliability, faith time.
5. One sharp question: how he'll get today done.

Keep it under ~180 words. No fluff.`;

    case "midday":
      return `Write the MIDDAY nudge. Short — 3 to 5 sentences, one question.

Look at today's daily_log progress in the system prompt. Call out only what's still open. Skip what's done. Ask him where he is and what his plan is for closing the gap before dinner. If strength session for today's pair is still open and it's the second day of the pair, press on it.`;

    case "evening":
      return `Write the EVENING check-in.

Must cover:
1. How'd today go? Walk the 5 streak gates — meals/calorie line, protein total, cardio, pliability, faith time — plus strength if today was a training day. Ask about whatever isn't already logged in Today's state.
2. Acknowledge anything already logged (system prompt shows current values). Celebrate hits, name misses without shaming. Remember: only claim a number is hit if it appears in Today's state.
3. Tomorrow's preview: which strength session is open, suggested cardio modality (mix steady-state and intervals across the week), and the pliability emphasis for tomorrow.
4. A tomorrow-ready anchor — one line tying it to who he is (family, faith, the target).

Keep it under ~220 words. End with a specific question he can answer in one sentence.`;

    case "sunday_retro":
      return `Write the SUNDAY RETROSPECTIVE. This opens a real conversation — not a stat dump. Target 160–220 words. Lead with reflection, land with one question that invites him to keep talking.

Style:
- Question-driven. You're in the room with him, not presenting a dashboard.
- Anchor the conversation with 1–2 specific numbers from the "Last 7 days" block — the one that drove the week most and the one that slipped most (e.g., "faith landed 7/7 but cardio slipped to 3/7"). Don't recite the whole table.
- Acknowledge the weekly-streak framing: a week counts when ≥5 of 7 days hit all 5 gates. If this week qualifies, name it. If it didn't, name what it would have taken ("you were one faith day and one cardio day away").
- Pull one specific moment from the conversation that stood out — a win OR a slip. Real details, not generic.
- Close with ONE sharp, open question. Examples:
  - "Which gate did you drift on without realizing it?"
  - "What's the one habit from this week you'd keep no matter what?"
  - "Where did the day fall apart — was it schedule, energy, or intent?"
  - "What do you need from me next week that you didn't get this one?"

What you learn in his reply will shape next week's program (that regen happens as a separate step after he engages — don't write the plan yourself here). If the week missed the streak gate, frame the adaptation as "small move, big return" — one concrete change you'd make, not a full rebuild.`;
  }
}
