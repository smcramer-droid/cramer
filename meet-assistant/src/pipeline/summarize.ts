import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";
import type { Attendee } from "../db.js";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const NextStepSchema = z.object({
  description: z.string().describe("What needs to happen, in imperative voice."),
  owner: z
    .string()
    .describe(
      "Attendee name who owns this. Use 'Me' for the organizer. Use 'Unassigned' if no one was named.",
    ),
  owner_email: z
    .string()
    .nullable()
    .describe("Email of the owner if known from the attendee list, else null."),
  due_date: z
    .string()
    .nullable()
    .describe("ISO-8601 date (YYYY-MM-DD) if a concrete date was mentioned, else null."),
  urgency: z
    .enum(["low", "medium", "high"])
    .describe("How time-sensitive the item is based on meeting tone."),
});

const FollowupSchema = z.object({
  days_out: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe("How many days from now the organizer should check in."),
  reason: z.string().describe("Short reason — what to check on."),
});

const SummarySchema = z.object({
  title: z.string().describe("One-line meeting title — who met and why."),
  tldr: z.string().describe("Two or three sentences — what was discussed and decided."),
  key_decisions: z
    .array(z.string())
    .describe("Concrete decisions reached. Empty array if none."),
  next_steps: z.array(NextStepSchema),
  topic_tags: z
    .array(z.string())
    .max(6)
    .describe("Short topic tags, e.g. ['pricing', 'hiring']."),
  followup_suggestions: z.array(FollowupSchema),
});

export type Summary = z.infer<typeof SummarySchema>;

function attendeeBlock(attendees: Attendee[]): string {
  if (!attendees.length) return "Attendees: (none recorded)";
  return (
    "Attendees:\n" +
    attendees
      .map((a) => `- ${a.name}${a.email ? ` <${a.email}>` : ""}`)
      .join("\n")
  );
}

const SYSTEM_PROMPT = `You are a meeting-notes assistant. You receive a raw speaker-diarized transcript from a Google Meet and produce a structured summary.

Rules:
- Use clear, direct language — no marketing fluff.
- A "next step" is something a specific person committed to do, or something the meeting clearly decided needs to happen. Do not invent action items.
- When you can match an owner to the attendee list, set owner_email to their email verbatim. If ambiguous, leave it null — don't guess.
- The organizer's name and email appear at the top of every transcript. Items they committed to should have owner="Me".
- For due_date: only extract a date if the transcript names one explicitly. "Next week" → compute from the meeting date. Vague phrases → null.
- Followup suggestions: propose 0-3 checkpoints the organizer should make on themselves or others (e.g. "check 3 days out that the contract draft was sent"). Keep them load-bearing — no busywork.
- Tone: professional and concise. The summary will be emailed to attendees.`;

export async function summarize(
  transcript: string,
  attendees: Attendee[],
): Promise<Summary> {
  const header = [
    `Organizer: ${config.USER_DISPLAY_NAME} <${config.USER_EMAIL}>`,
    attendeeBlock(attendees),
    `Meeting date: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const response = await anthropic.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${header}\n\n--- TRANSCRIPT ---\n${transcript}`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: "Produce the structured summary now.",
          },
        ],
      },
    ],
    output_config: {
      format: zodOutputFormat(SummarySchema),
    },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(`Claude did not return a parseable summary (stop_reason=${response.stop_reason})`);
  }
  return parsed;
}
