#!/usr/bin/env bash
# One-command live status for Cramerica.
#   First run: prompts once for bot token, rotates the admin secret,
#              re-registers the Telegram webhook, saves config to
#              ~/.cramerica.json, then fetches status.
#   Subsequent runs: just fetches + formats status.
#
# Flags (pass as args to `npm run status -- ...`):
#   --section=<name>  one of overview(default), errors, messages,
#                     logs, assessment, program, checkins
#   --limit=<n>       default 30
#   --raw             dump full JSON instead of formatting
#   --reconfigure     force re-bootstrap (new secret, new webhook)

set -euo pipefail

CONFIG="$HOME/.cramerica.json"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT_DIR"

SECTION="overview"
LIMIT="30"
RAW=0
RECONFIGURE=0
for arg in "$@"; do
  case "$arg" in
    --section=*)    SECTION="${arg#*=}" ;;
    --limit=*)      LIMIT="${arg#*=}" ;;
    --raw)          RAW=1 ;;
    --reconfigure)  RECONFIGURE=1 ;;
    --help|-h)
      grep -E '^#( |$)' "$0" | sed 's/^# ?//'
      exit 0
      ;;
  esac
done

bootstrap() {
  printf '\nFirst-time status setup.\n'
  printf 'I will: rotate the admin secret in Cloudflare, re-register the\n'
  printf 'Telegram webhook with it, and save { url, secret } to %s.\n\n' "$CONFIG"

  # Worker URL: try to detect, else ask.
  local url=""
  if [ -f "$CONFIG" ]; then
    url="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).url||'')}catch{}")"
  fi
  if [ -z "$url" ]; then
    printf 'Worker URL (e.g. https://cramerica.smcramer.workers.dev): '
    read -r url
  fi
  url="${url%/}"
  [ -z "$url" ] && { echo "Worker URL required."; exit 1; }

  read -r -s -p "Paste your Telegram bot token (hidden): " bot_token
  printf '\n'
  [ -z "$bot_token" ] && { echo "Bot token required."; exit 1; }

  local secret
  secret="$(openssl rand -hex 32)"

  echo "→ Writing secret to Cloudflare..."
  printf '%s' "$secret" | npx --no-install wrangler secret put TELEGRAM_WEBHOOK_SECRET >/dev/null

  echo "→ Registering webhook with Telegram..."
  BOT_TOKEN="$bot_token" WEBHOOK_URL="$url/webhook" WEBHOOK_SECRET="$secret" \
    node "$SCRIPT_DIR/set-webhook.mjs"

  node -e "require('fs').writeFileSync('$CONFIG', JSON.stringify({url:'$url',secret:'$secret'}))"
  chmod 600 "$CONFIG"
  echo "→ Config saved to $CONFIG"
  printf '\n'
}

if [ "$RECONFIGURE" = "1" ] || [ ! -f "$CONFIG" ]; then
  bootstrap
fi

URL="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).url)")"
SECRET="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).secret)")"

RESP="$(curl -sS --max-time 15 -H "x-admin-secret: $SECRET" \
  "$URL/admin/state?section=$SECTION&limit=$LIMIT" || true)"

if [ -z "$RESP" ]; then
  echo "No response from $URL/admin/state. Is the Worker deployed?"
  exit 1
fi

# Detect auth failure (stale secret) and auto-reconfigure once.
if echo "$RESP" | grep -q "unauthorized"; then
  echo "Got 401 from /admin/state — secret mismatch. Re-bootstrapping..."
  bootstrap
  SECRET="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).secret)")"
  RESP="$(curl -sS --max-time 15 -H "x-admin-secret: $SECRET" \
    "$URL/admin/state?section=$SECTION&limit=$LIMIT")"
fi

if [ "$RAW" = "1" ]; then
  echo "$RESP"
else
  echo "$RESP" | node "$SCRIPT_DIR/format-status.mjs"
fi
