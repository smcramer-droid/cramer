import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { meetings } from "../db.js";
import { processMeeting } from "../pipeline/process.js";

export const webhookRouter = Router();

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

webhookRouter.post("/webhook/recall", (req, res) => {
  const provided =
    (req.header("x-recall-signature") as string | undefined) ??
    (req.query.secret as string | undefined);
  if (!provided || !constantTimeEqual(provided, config.RECALL_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "bad signature" });
  }

  const body = req.body as {
    event?: string;
    data?: { bot_id?: string; status?: { code?: string } };
  };

  const botId = body?.data?.bot_id;
  const event = body?.event ?? "";

  if (!botId) {
    return res.status(200).json({ ok: true, note: "no bot_id — ignored" });
  }

  const m = meetings.get(botId);
  if (!m) {
    return res.status(200).json({ ok: true, note: "unknown bot_id — ignored" });
  }

  const statusCode = body?.data?.status?.code ?? "";
  console.log(`[webhook] ${event} ${statusCode} for ${botId}`);

  if (event.includes("in_call") || statusCode === "in_call_recording") {
    meetings.setStatus(botId, "recording");
  }

  const isTerminal =
    event.includes("done") ||
    event.includes("call_ended") ||
    statusCode === "done" ||
    statusCode === "call_ended";

  if (isTerminal) {
    res.status(202).json({ ok: true, accepted: "processing" });
    processMeeting(botId).catch((err) =>
      console.error(`[webhook] processMeeting failed for ${botId}:`, err),
    );
    return;
  }

  res.status(200).json({ ok: true });
});
