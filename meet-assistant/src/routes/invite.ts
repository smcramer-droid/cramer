import { Router } from "express";
import { z } from "zod";
import { inviteBot } from "../bot/recall.js";
import { meetings } from "../db.js";
import { config } from "../config.js";

export const inviteRouter = Router();

const InviteBody = z.object({
  meet_url: z.string().url().refine((u) => u.includes("meet.google.com"), {
    message: "Expected a meet.google.com URL",
  }),
  title: z.string().optional(),
});

inviteRouter.post("/invite", async (req, res) => {
  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { bot_id } = await inviteBot(parsed.data.meet_url);
    meetings.insert({
      id: bot_id,
      google_meet_url: parsed.data.meet_url,
      title: parsed.data.title ?? null,
      organizer_email: config.USER_EMAIL,
      status: "pending",
      created_at: new Date().toISOString(),
    });
    res.json({ bot_id, status: "pending" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[invite] failed:", msg);
    res.status(502).json({ error: msg });
  }
});
