# Cramerica

Personal fitness & accountability coach. Telegram bot on Cloudflare Workers,
backed by D1, powered by the Claude API.

- **Three daily check-ins + Sunday retro** — morning/midday/evening fire at
  randomized minutes inside ET windows (7–9am / 12–2pm / 8–10pm) so it feels
  organic. Sunday's evening slot is replaced by a longer retrospective.
- **Daily trackables** — 200g protein, ≤1800 cal, 30 min cardio, 10 min golf
  pliability. Parsed automatically from replies.
- **3 strength sessions/week** on A=Mon/Tue, B=Wed/Thu, C=Fri/Sat pairs.
- **Target** — sub-15% body fat by **June 12, 2026**.
- **Voice** — hard when you slip, warm when you win. Faith + family anchored.

## Layout

```
cramerica/
├── wrangler.toml         Worker config: cron, D1 binding, vars
├── migrations/           D1 schema
├── scripts/              one-off: Telegram setWebhook
└── src/
    ├── index.ts          fetch + scheduled entry
    ├── scheduler.ts      windowed-random firing, idempotent per slot/day
    ├── time.ts           ET-aware date/minute helpers
    ├── telegram.ts       Bot API (sendMessage, sendChatAction)
    ├── claude.ts         Anthropic SDK wrapper
    ├── db.ts             D1 reads/writes + streak recomputation
    ├── program.ts        strength session templates (week-1 default)
    ├── pliability.ts     7-day rotating 10-min routines
    ├── prompts/
    │   ├── system.ts     Cramerica persona; interpolates profile + state
    │   └── checkins.ts   per-slot directives
    └── handlers/
        ├── checkin.ts    fires a check-in to Telegram
        └── message.ts    incoming reply: parse logs → Claude → reply
```

## First-time deploy

```bash
cd cramerica
npm install

# 1. Create D1 database. Copy database_id into wrangler.toml.
npm run db:create

# 2. Apply migrations (run both local + remote for parity).
npm run db:migrate
npm run db:migrate:local

# 3. Set secrets. Rotate the bot token in BotFather first (/revoke).
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any long random string

# 4. Deploy.
npm run deploy

# 5. Register the webhook with Telegram.
BOT_TOKEN=<token> \
WEBHOOK_URL=https://cramerica.<subdomain>.workers.dev/webhook \
WEBHOOK_SECRET=<same string you just set as secret> \
node scripts/set-webhook.mjs

# 6. In Telegram, send the bot any message — this captures your chat_id.
#    Then manually trigger the first check-in:
curl -X POST -H "x-admin-secret: <WEBHOOK_SECRET>" \
  "https://cramerica.<subdomain>.workers.dev/admin/fire?slot=morning"
```

## Development

```bash
npm run dev               # wrangler dev, local D1
npm run typecheck
npm run tail              # live logs from deployed Worker
```

## Operational notes

- **Timezone**: all scheduling reasoned in `America/New_York`. Windows and
  week-start (Monday) are ET-local. DST is handled automatically by
  `Intl.DateTimeFormat`.
- **Idempotency**: `checkin (date, slot)` row has a `fired_at`. Once set, that
  slot is done for the day regardless of how many cron ticks fire.
- **Variance**: the first cron tick inside a window picks a random minute,
  writes it to the `checkin` row, and fires when the clock reaches it.
- **Privacy**: all data stays in your Cloudflare account (D1 + secrets).
  Conversation history is stored for context — wipe via
  `wrangler d1 execute cramerica --remote --command="DELETE FROM message"`.
- **Cost**: Workers + D1 free tier covers this. Claude API spend is ~pennies
  per day at 3–4 turns (Sonnet 4.6 for daily, Opus 4.7 on Sundays).

## Tweaking goals

Edit `profile` defaults in `migrations/0001_init.sql`, or update live:

```bash
wrangler d1 execute cramerica --remote \
  --command="UPDATE profile SET protein_goal_g=210 WHERE id=1"
```

## Feature map (shipped)

- **Week-1 intake** — first morning check-in runs a 10-question conversational
  assessment. Last answer triggers Opus 4.7 to extract structured profile
  fields + generate this week's 3 sessions + a 7-week arc. Flow gates all
  other check-ins until complete. See `src/assessment.ts`.
- **Weekly program regen** — on the first check-in of each new week,
  `ensureWeekProgram` runs Opus 4.7 against the previous week's adherence +
  strength completion + Sunday retro conversation, persists the next three
  A/B/C sessions. Falls back to the prior plan on failure. See `src/weekly.ts`.
- **Sunday retro stats** — Sunday's system prompt includes computed weekly
  stats: adherence %, daily hit counts for each target, average protein/cal,
  cardio + pliability totals, strength pairs closed, weight delta.
- **Inline quick-log buttons** — morning/midday/evening check-ins include
  four buttons: ✅ Pliability (10m), ✅ Strength done, ✅ Cardio 30m,
  ✅ Meal logged. Tapped buttons update `daily_log` and are stripped from the
  keyboard so they can't be double-tapped. See `src/buttons.ts`,
  `src/handlers/callback.ts`.

## Roadmap (post-MVP)

- Photo intake for meal logging (Claude vision → protein estimate).
- Weekly trend chart (weight + adherence) posted with Sunday retro.
- `/retro` manual command to re-open last Sunday's reflection.
