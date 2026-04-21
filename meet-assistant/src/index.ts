import express from "express";
import { config } from "./config.js";
import { inviteRouter } from "./routes/invite.js";
import { webhookRouter } from "./routes/webhook.js";
import { oauthRouter } from "./routes/oauth.js";
import { startScheduler } from "./followup/scheduler.js";
import { meetings, tokens } from "./db.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  const google = tokens.get("google", config.USER_EMAIL);
  const ticktick = tokens.get("ticktick", config.USER_EMAIL);
  const recent = meetings.listRecent(10);
  res.json({
    user: { email: config.USER_EMAIL, name: config.USER_DISPLAY_NAME },
    connected: {
      google: !!google,
      ticktick: !!ticktick,
    },
    oauth_links: {
      google: `${config.PUBLIC_URL}/oauth/google`,
      ticktick: `${config.PUBLIC_URL}/oauth/ticktick`,
    },
    recent_meetings: recent.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      created_at: m.created_at,
      completed_at: m.completed_at,
    })),
  });
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use(inviteRouter);
app.use(webhookRouter);
app.use(oauthRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[error]", msg);
  res.status(500).json({ error: msg });
});

app.listen(config.PORT, () => {
  console.log(`meet-assistant listening on :${config.PORT} (public: ${config.PUBLIC_URL})`);
  startScheduler();
});
