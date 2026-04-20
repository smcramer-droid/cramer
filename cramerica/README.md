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

## First-time deploy (one command)

```bash
cd cramerica
npx wrangler login          # one-time browser sign-in to Cloudflare
npm run setup               # the script does everything else
```

`npm run setup` (see `scripts/setup.sh`):

1. Installs dependencies if needed.
2. Creates the D1 database (or reuses an existing one named `cramerica`).
3. Writes the `database_id` into `wrangler.toml` automatically.
4. Applies migrations.
5. Deploys the Worker and captures the URL.
6. Prompts once for your **TELEGRAM_BOT_TOKEN** and **ANTHROPIC_API_KEY**
   (input hidden), generates the webhook secret itself, writes all three
   to Cloudflare.
7. Registers the webhook with Telegram.
8. Tells you to go hit `/start` in Telegram.

The script is idempotent — safe to re-run if anything misfires.

### Manual deploy (if you'd rather)

<details>
<summary>Expand for the step-by-step path.</summary>

```bash
cd cramerica
npm install

npx wrangler login
npx wrangler d1 create cramerica        # copy the database_id it prints
# → paste the id into wrangler.toml, replacing REPLACE_WITH_D1_ID

npx wrangler d1 migrations apply cramerica --remote
npx wrangler deploy                      # copy the worker URL it prints

npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any long random string

BOT_TOKEN=<token> \
WEBHOOK_URL=https://cramerica.<subdomain>.workers.dev/webhook \
WEBHOOK_SECRET=<same string you set as secret> \
node scripts/set-webhook.mjs

# In Telegram, send your bot /start
```
</details>

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

## Commands

- `/start` — begin (or resume) the week-1 intake. Use this right after
  deploy to kick off the first conversation.
- `/today` — today's trackables + streak + strength-week status.
- `/stats` (or `/charts`) — sends the current chart pack: daily-targets
  adherence (7 days), protein + calories (7 days), weight trend (28 days),
  strength sessions closed (6 weeks).
- `/retro` — manually re-open Sunday's retrospective (runs the Opus-style
  reflection + sends the chart pack).
- `/help` — lists the commands.

## Meal photos

Send the bot a photo of a meal (optionally with a caption for context).
Claude vision estimates calories + protein and logs it to `daily_log`. If
the photo is unclear (portion size, hidden components), the bot asks ONE
clarifying question — your next text reply resolves it and logs.

Correction flow: after a photo is logged, just reply with the fix
("actually that was 8oz chicken not 6") — the normal text parser picks up
numeric corrections for calories/protein.

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

- `/retro` manual command to re-open last Sunday's reflection.
- Self-hosted chart rendering (replace QuickChart with a Worker-native
  SVG → PNG path) if the external dependency becomes an issue.
- Trend deltas surfaced inline during weekday check-ins (e.g., "protein
  trending +18g vs. last week").

## Third-party note: charts

`src/charts.ts` builds chart images via **QuickChart.io**. Only numeric
values leave Cloudflare — no names or identifiers. If you'd rather keep
everything in-house, swap the `qcUrl` builder for a Worker endpoint that
renders SVG → PNG (e.g., using `@resvg/resvg-wasm`).
