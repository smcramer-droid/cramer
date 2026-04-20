import { fireCheckin } from "./handlers/checkin";
import { handleIncoming } from "./handlers/message";
import { checkDueCheckin } from "./scheduler";
import type { Env, Slot } from "./types";
import type { TgUpdate } from "./telegram";
import { etNow } from "./time";

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

    if (url.pathname === "/healthz") {
      const now = etNow();
      return Response.json({ ok: true, et: now });
    }

    return new Response("cramerica", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
