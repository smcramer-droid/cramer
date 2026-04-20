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
4. The day's 4 trackables as a simple checklist the user can reply-log against.
5. One sharp question: how he'll get today done.

Keep it under ~180 words. No fluff.`;

    case "midday":
      return `Write the MIDDAY nudge. Short — 3 to 5 sentences, one question.

Look at today's daily_log progress in the system prompt. Call out only what's still open. Skip what's done. Ask him where he is and what his plan is for closing the gap before dinner. If strength session for today's pair is still open and it's the second day of the pair, press on it.`;

    case "evening":
      return `Write the EVENING check-in.

Must cover:
1. How'd today go? Ask him directly — meals logged? hit the calorie line? protein total? cardio done? pliability done? strength if today was a training day?
2. Acknowledge anything already logged (system prompt shows current values). Celebrate hits, name misses without shaming.
3. Tomorrow's preview: which strength session is open, suggested cardio modality (mix steady-state and intervals across the week), and the pliability emphasis for tomorrow.
4. A tomorrow-ready anchor — one line tying it to ${"who he is"}.

Keep it under ~220 words. End with a specific question he can answer in one sentence.`;

    case "sunday_retro":
      return `Write the SUNDAY RETROSPECTIVE. This is longer and conversational — 250–350 words.

Cover:
1. Week review. Look at the daily_log + strength_session data in the system prompt. Name the numbers — adherence %, protein average, strength pairs closed, streak status.
2. What worked. Pull specific moments from the conversation that stood out.
3. What didn't. Be honest. Not harsh — honest. "Wednesday's midday went dark" type of specifics.
4. Progress toward sub-${"target"}% BF by ${"June 12"}. Are we on pace?
5. Two open questions for him:
   a. What do you want to change for next week?
   b. What do you need from me (the coach) that you didn't get this week?

Do NOT generate next week's strength plan yourself — that runs as a separate step after he answers. Just prompt the conversation.`;
  }
}
