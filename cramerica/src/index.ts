import { handleCallback } from "./handlers/callback";
import { fireCheckin } from "./handlers/checkin";
import { handleIncoming } from "./handlers/message";
import { checkDueCheckin } from "./scheduler";
import type { Env, Slot } from "./types";
import type { TgUpdate } from "./telegram";
import { etNow } from "./time";

export { ProgramGenerator } from "./program_generator";

async function dumpState(env: Env, section: string, limit: number): Promise<unknown> {
  const now = etNow();
  const sections: Record<string, () => Promise<unknown>> = {
    overview: async () => ({
      et: now,
      profile: (await env.DB.prepare("SELECT * FROM profile WHERE id=1").first()) ?? null,
      today: (await env.DB.prepare("SELECT * FROM daily_log WHERE date=?").bind(now.date).first()) ?? null,
      weekSessions: (await env.DB
        .prepare("SELECT letter, completed_date, plan_json IS NOT NULL AS has_plan FROM strength_session WHERE week_start=? ORDER BY letter")
        .bind(now.weekStart).all()).results ?? [],
      recentErrors: (await env.DB
        .prepare("SELECT id, source, message, substr(details,1,400) AS details, created_at FROM error_log ORDER BY id DESC LIMIT ?")
        .bind(Math.min(limit, 10)).all()).results ?? [],
      recentMessages: (await env.DB
        .prepare("SELECT role, substr(content,1,200) AS content, slot, created_at FROM message ORDER BY id DESC LIMIT ?")
        .bind(Math.min(limit, 15)).all()).results ?? [],
    }),
    errors: async () => ({
      errors: (await env.DB
        .prepare("SELECT id, source, message, details, created_at FROM error_log ORDER BY id DESC LIMIT ?")
        .bind(limit).all()).results ?? [],
    }),
    messages: async () => ({
      messages: (await env.DB
        .prepare("SELECT id, role, content, slot, created_at FROM message ORDER BY id DESC LIMIT ?")
        .bind(limit).all()).results ?? [],
    }),
    logs: async () => ({
      daily_log: (await env.DB
        .prepare("SELECT * FROM daily_log ORDER BY date DESC LIMIT ?")
        .bind(limit).all()).results ?? [],
    }),
    assessment: async () => ({
      answers: (await env.DB
        .prepare("SELECT id, question, answer, created_at FROM assessment ORDER BY id").all()).results ?? [],
    }),
    program: async () => ({
      program: (await env.DB
        .prepare("SELECT * FROM program ORDER BY week_start DESC LIMIT ?").bind(limit).all()).results ?? [],
      sessions: (await env.DB
        .prepare("SELECT * FROM strength_session ORDER BY week_start DESC, letter LIMIT ?").bind(limit).all()).results ?? [],
    }),
    checkins: async () => ({
      checkins: (await env.DB
        .prepare("SELECT * FROM checkin ORDER BY date DESC, slot LIMIT ?").bind(limit).all()).results ?? [],
    }),
  };
  const fn = sections[section];
  if (!fn) return { error: `unknown section '${section}'`, available: Object.keys(sections) };
  return await fn();
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        const due = await checkDueCheckin(env);
        if (due) await fireCheckin(env, due.slot, due.date, due.weekStart);
      } catch (err) {
        console.error("scheduled error", err);
      }
    })());
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/webhook" && req.method === "POST") {
      const secret = req.headers.get("x-telegram-bot-api-secret-token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const update = await req.json<TgUpdate>();
      const msg = update.message ?? update.edited_message;
      if (msg) {
        // Ack Telegram immediately; process in background.
        ctx.waitUntil(handleIncoming(env, msg).catch((e) => console.error("incoming error", e)));
      } else if (update.callback_query) {
        ctx.waitUntil(handleCallback(env, update.callback_query).catch((e) => console.error("callback error", e)));
      }
      return new Response("ok");
    }

    // Manual trigger for testing — authenticated via webhook secret header.
    if (url.pathname === "/admin/fire" && req.method === "POST") {
      if (req.headers.get("x-admin-secret") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const slot = url.searchParams.get("slot") as Slot | null;
      if (!slot || !["morning", "midday", "evening", "sunday_retro"].includes(slot)) {
        return new Response("bad slot", { status: 400 });
      }
      const now = etNow();
      ctx.waitUntil(fireCheckin(env, slot, now.date, now.weekStart));
      return new Response(`fired ${slot}`);
    }

    // Remote inspection endpoint — dump state for debugging from Claude Code.
    // Accepts secret via x-admin-secret header OR ?secret=... query param
    // (the latter so Claude Code's WebFetch, which can't send custom headers,
    // can still inspect state directly).
    if (url.pathname === "/admin/state" && req.method === "GET") {
      const providedSecret = req.headers.get("x-admin-secret") ?? url.searchParams.get("secret");
      if (providedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const section = url.searchParams.get("section") ?? "overview";
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "30"), 200);
      const data = await dumpState(env, section, limit);
      return Response.json(data, { headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/healthz") {
      const now = etNow();
      return Response.json({ ok: true, et: now });
    }

    return new Response("cramerica", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
