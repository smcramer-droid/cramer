import { request } from "undici";
import { config } from "../config.js";
import type { Attendee } from "../db.js";

const BASE = "https://us-west-2.recall.ai/api/v1";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function recall<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const res = await request(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Token ${config.RECALL_API_KEY}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`Recall ${method} ${path} → ${res.statusCode}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export interface InviteResult {
  bot_id: string;
}

export async function inviteBot(meetUrl: string): Promise<InviteResult> {
  const webhookUrl = `${config.PUBLIC_URL}/webhook/recall?secret=${encodeURIComponent(
    config.RECALL_WEBHOOK_SECRET,
  )}`;
  const bot = await recall<{ id: string }>("POST", "/bot", {
    meeting_url: meetUrl,
    bot_name: config.RECALL_BOT_NAME,
    transcription_options: { provider: "meeting_captions" },
    webhook_url: webhookUrl,
  });
  return { bot_id: bot.id };
}

interface RecallTranscriptWord {
  text: string;
  start_timestamp?: number;
  end_timestamp?: number;
}

interface RecallTranscriptSegment {
  speaker: string | null;
  speaker_id?: number | null;
  words: RecallTranscriptWord[];
}

interface RecallParticipant {
  id: number;
  name: string | null;
  email: string | null;
}

export interface TranscriptBundle {
  transcript: string;
  attendees: Attendee[];
}

export async function fetchTranscript(botId: string): Promise<TranscriptBundle> {
  const segments = await recall<RecallTranscriptSegment[]>(
    "GET",
    `/bot/${botId}/transcript`,
  );

  const transcript = segments
    .map((seg) => {
      const speaker = seg.speaker ?? "Unknown";
      const text = seg.words.map((w) => w.text).join(" ").trim();
      return text ? `${speaker}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");

  let participants: RecallParticipant[] = [];
  try {
    const bot = await recall<{ meeting_participants?: RecallParticipant[] }>(
      "GET",
      `/bot/${botId}`,
    );
    participants = bot.meeting_participants ?? [];
  } catch {
    // non-fatal — fall back to speaker names pulled from the transcript
  }

  const attendees: Attendee[] = participants.length
    ? participants
        .filter((p) => p.name)
        .map((p) => ({ name: p.name as string, email: p.email }))
    : Array.from(new Set(segments.map((s) => s.speaker).filter(Boolean) as string[])).map(
        (name) => ({ name, email: null }),
      );

  return { transcript, attendees };
}
