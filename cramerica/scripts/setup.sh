#!/usr/bin/env bash
# One-shot setup for Cramerica. Creates the D1 database, patches wrangler.toml,
# applies migrations, deploys the Worker, writes the three secrets, and
# registers the Telegram webhook. Idempotent — safe to re-run.

set -euo pipefail

on_error() {
  local exit_code=$?
  local line=$1
  printf '\n\033[1;31m✖ setup.sh exited with code %s at line %s\033[0m\n' "$exit_code" "$line" >&2
  printf '  Re-run `npm run setup` — the script is idempotent.\n' >&2
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT_DIR"

sep()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
fail() { printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- prereqs ----------

command -v node >/dev/null 2>&1 || fail "Node is required. Install from https://nodejs.org/"
command -v openssl >/dev/null 2>&1 || fail "openssl is required (ships with most systems)."

if [ ! -d "node_modules" ]; then
  sep "Installing npm dependencies"
  npm install
fi

# ---------- cloudflare auth ----------

sep "Checking Cloudflare auth"
if ! npx --no-install wrangler whoami >/dev/null 2>&1; then
  printf '\nYou are not logged in to Cloudflare. Run this in another terminal:\n\n'
  printf '    npx wrangler login\n\n'
  printf 'Then re-run ./scripts/setup.sh.\n'
  exit 1
fi
CF_ACCOUNT="$(npx --no-install wrangler whoami 2>/dev/null | grep -Ei 'account|email' | head -1 || true)"
info "${CF_ACCOUNT:-(logged in)}"

# ---------- D1 database ----------

sep "Preparing D1 database"
CURRENT_ID="$(grep -E '^database_id' wrangler.toml | sed -E 's/.*"([^"]+)".*/\1/' || true)"

if [ "$CURRENT_ID" == "REPLACE_WITH_D1_ID" ] || [ -z "$CURRENT_ID" ]; then
  # Try to find an existing DB named cramerica first.
  EXISTING_ID="$(npx --no-install wrangler d1 list --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const r=a.find(x=>x.name==="cramerica");if(r)process.stdout.write(r.uuid||r.id||"");}catch(e){}})' \
    || true)"

  if [ -n "$EXISTING_ID" ]; then
    DB_ID="$EXISTING_ID"
    info "Found existing D1 'cramerica': $DB_ID"
  else
    info "Creating D1 database 'cramerica'..."
    CREATE_OUT="$(npx --no-install wrangler d1 create cramerica 2>&1)"
    DB_ID="$(echo "$CREATE_OUT" | grep -E 'database_id' | sed -E 's/.*"([^"]+)".*/\1/' | head -1)"
    [ -z "$DB_ID" ] && fail "Could not parse database_id from wrangler output:\n$CREATE_OUT"
    info "Created: $DB_ID"
  fi

  # Patch wrangler.toml (portable sed: -i with suffix works on macOS + GNU).
  sed -i.bak -E "s|database_id = \"REPLACE_WITH_D1_ID\"|database_id = \"$DB_ID\"|" wrangler.toml
  rm -f wrangler.toml.bak
  info "Wrote database_id into wrangler.toml"
else
  DB_ID="$CURRENT_ID"
  info "Using database_id from wrangler.toml: $DB_ID"
fi

# ---------- migrations ----------

sep "Applying D1 migrations"
# Closing stdin makes wrangler detect non-interactive mode and auto-confirm.
# (yes | ... would work but trips set -o pipefail on SIGPIPE.)
npx --no-install wrangler d1 migrations apply cramerica --remote < /dev/null

# ---------- deploy ----------

sep "Deploying Worker"
DEPLOY_OUT="$(npx --no-install wrangler deploy 2>&1 | tee /dev/tty)"
WORKER_URL="$(echo "$DEPLOY_OUT" | grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' | head -1)"
[ -z "$WORKER_URL" ] && fail "Could not extract Worker URL from deploy output."
info "Worker URL: $WORKER_URL"

# ---------- secrets ----------

sep "Secrets"
printf '    I need three values. Input is hidden.\n'

printf '\n    1/3  TELEGRAM_BOT_TOKEN  (from @BotFather)\n'
read -r -s -p "         paste here: " BOT_TOKEN; printf '\n'
[ -z "$BOT_TOKEN" ] && fail "Bot token cannot be empty."

printf '\n    2/3  ANTHROPIC_API_KEY  (sk-ant-... from console.anthropic.com)\n'
read -r -s -p "         paste here: " ANTHROPIC_KEY; printf '\n'
[ -z "$ANTHROPIC_KEY" ] && fail "Anthropic key cannot be empty."

WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf '\n    3/3  TELEGRAM_WEBHOOK_SECRET  (auto-generated)\n'

info "Writing secrets to Cloudflare..."
printf '%s' "$BOT_TOKEN"       | npx --no-install wrangler secret put TELEGRAM_BOT_TOKEN      >/dev/null
printf '%s' "$ANTHROPIC_KEY"   | npx --no-install wrangler secret put ANTHROPIC_API_KEY       >/dev/null
printf '%s' "$WEBHOOK_SECRET"  | npx --no-install wrangler secret put TELEGRAM_WEBHOOK_SECRET >/dev/null
info "All three secrets set."

# ---------- webhook ----------

sep "Registering Telegram webhook"
BOT_TOKEN="$BOT_TOKEN" \
WEBHOOK_URL="$WORKER_URL/webhook" \
WEBHOOK_SECRET="$WEBHOOK_SECRET" \
node scripts/set-webhook.mjs

# Save config so `npm run status` works without another prompt.
CONFIG="$HOME/.cramerica.json"
node -e "require('fs').writeFileSync('$CONFIG', JSON.stringify({url:'$WORKER_URL',secret:'$WEBHOOK_SECRET'}))"
chmod 600 "$CONFIG"
info "Saved admin config to $CONFIG (for npm run status)"

unset BOT_TOKEN ANTHROPIC_KEY WEBHOOK_SECRET

# ---------- done ----------

printf '\n\033[1;32m✔ Cramerica is live.\033[0m\n'
printf '   Worker: %s\n' "$WORKER_URL"
printf '   Next:   open Telegram → your bot → send \033[1m/start\033[0m\n'
printf '   Check:  \033[1mnpm run status\033[0m (human-readable live state)\n\n'
printf 'Tail logs in another terminal with:\n'
printf '   npx wrangler tail\n\n'
