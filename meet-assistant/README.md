# meet-assistant

Invite a bot to a Google Meet, have it listen the whole time, and when the call
ends you get a summary email to attendees and your personal action items pushed
to TickTick — with follow-up nudges as due dates approach.

## What it does

1. You `POST /invite` a `meet.google.com` URL.
2. A Recall.ai bot joins the call as a participant and captures captions.
3. When the call ends, Recall fires a webhook here.
4. We pull the transcript, hand it to Claude Opus 4.7, and get back a
   structured summary: TL;DR, decisions, next steps (per-owner), and a set of
   follow-up checkpoints.
5. The summary is emailed to every attendee we have an address for, via your
   own Gmail account.
6. Items owned by you get pushed into TickTick with due dates and priorities.
7. A cron loop (every 15 min) sends you follow-up digests as due dates land.

## Architecture

```
POST /invite ──► Recall.ai API ──► bot joins Meet
                                        │
                                        ▼ (call ends)
Recall.ai webhook ──► POST /webhook/recall
                                        │
                                        ▼
                          fetchTranscript → Claude Opus 4.7
                                        │
                               ┌────────┴────────┐
                               ▼                 ▼
                         Gmail send       TickTick createTask
                       (attendees)        (your items)
                               │
                               ▼
                       followups table ──► cron ──► Gmail digest to you
```

## Prerequisites

- Node 20+
- A public HTTPS URL (ngrok, Cloudflare Tunnel, or a real deploy) so Recall
  can reach `/webhook/recall`
- Accounts / API keys:
  - **Recall.ai** — the bot that joins the Meet. Sign up, grab an API key
    from the dashboard. Free tier covers a handful of meetings.
  - **Anthropic** — for summarization. `ANTHROPIC_API_KEY`.
  - **Google Cloud OAuth client** — enable the Gmail API, create an OAuth 2.0
    Web client, add `{PUBLIC_URL}/oauth/google/callback` as an authorized
    redirect URI.
  - **TickTick developer app** — from developer.ticktick.com, same idea —
    redirect URI `{PUBLIC_URL}/oauth/ticktick/callback`.

## Setup

```bash
cd meet-assistant
cp .env.example .env
# fill in the values
npm install
npm run dev
```

Then in another tab, expose the port publicly:

```bash
ngrok http 8787
# paste the https URL into PUBLIC_URL in .env and restart npm run dev
```

## First-run auth

Open these in a browser, one-time, to grant OAuth consent:

- `{PUBLIC_URL}/oauth/google` — Gmail send access
- `{PUBLIC_URL}/oauth/ticktick` — TickTick task write

Tokens are persisted in the SQLite DB (`data/meet-assistant.db`). Refresh
happens automatically.

Visit `{PUBLIC_URL}/` at any time to see connection status and recent meetings.

## Usage

Invite the bot to a meeting that's about to start:

```bash
curl -X POST "$PUBLIC_URL/invite" \
  -H "content-type: application/json" \
  -d '{"meet_url": "https://meet.google.com/abc-defg-hij", "title": "Pricing sync"}'
# → {"bot_id":"...","status":"pending"}
```

The bot joins, captions are captured, and when the call ends you'll see:

- A summary email delivered from your Gmail to the attendees
- Your to-dos showing up in TickTick (tagged `meeting-assistant` + topic tags)
- A `followups` row scheduled for each deadline / suggestion

## Notes & limitations

- **Attendee emails.** Recall.ai exposes attendee emails only when the meeting
  host has them resolved — in practice, Workspace domains and signed-in users.
  If nobody's email is visible, the summary email step will fail; the TickTick
  push still runs. The summary is always saved in the DB.
- **Captions vs. audio.** We use Google Meet's native captions (cheapest, no
  extra transcription cost). For non-English meetings or poor audio, swap the
  Recall config in `src/bot/recall.ts` to use `deepgram` or `assemblyai`.
- **Bot identity.** The bot shows up as "Meet Assistant" (configurable via
  `RECALL_BOT_NAME`). Some Workspace admins block external participants — if
  the bot can't join, that's usually why.
- **Self-hosted alternative.** If you want to ditch Recall.ai, replace
  `src/bot/recall.ts` with a Playwright driver that launches a headless Chrome
  signed into a dedicated Google account, joins the Meet, and pipes audio to
  Whisper/Deepgram. Same interface, more fragile.

## Layout

```
src/
  config.ts              # env validation (zod)
  db.ts                  # SQLite schema + typed helpers
  index.ts               # Express app + scheduler boot
  bot/recall.ts          # Recall.ai: invite bot, fetch transcript
  pipeline/summarize.ts  # Claude Opus 4.7 w/ prompt caching + structured output
  pipeline/process.ts    # transcript → summary → email + TickTick fan-out
  delivery/gmail.ts      # Gmail API (base64url MIME, markdown → HTML)
  delivery/ticktick.ts   # TickTick /open/v1/task create
  auth/google.ts         # googleapis OAuth2 + token refresh
  auth/ticktick.ts       # TickTick OAuth2 + token refresh
  followup/scheduler.ts  # node-cron, 15-min tick, digest emails
  routes/invite.ts       # POST /invite
  routes/webhook.ts      # POST /webhook/recall
  routes/oauth.ts        # OAuth redirect handlers
```

## Costs (ballpark)

- Recall.ai: ~$0.10–0.30 per meeting on the pay-as-you-go tier
- Claude Opus 4.7: a 1-hour meeting transcript is ~15K input tokens; with
  prompt caching enabled, re-querying the same transcript for a follow-up
  digest reads from cache (~0.1× price)
- Gmail / TickTick: free

## Extending

- **Calendar integration.** Add a `/calendar/watch` endpoint that reads your
  Google Calendar and auto-invites the bot to any event with a Meet link.
- **Per-attendee to-dos.** Right now only your items go to TickTick. Add a
  table of attendee → TickTick/Todoist mapping and push theirs too (with their
  consent).
- **Slack/Linear fan-out.** `delivery/ticktick.ts` is the template — add
  `delivery/slack.ts` and fork in `process.ts`.
