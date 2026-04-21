#!/usr/bin/env bash
# One-shot setup for running Claude Code locally against the pool-designer
# repo with gh + wrangler auth. Idempotent — re-running skips completed steps.
#
# Usage: bash setup-claude-local.sh

set -euo pipefail

REPO="smcramer-droid/cramer"
BRANCH="claude/implement-pool-designer-1Bby3"
WORKDIR="${HOME}/code/cramer"

say() { printf "\n\033[1;36m== %s ==\033[0m\n" "$*"; }
ok()  { printf "   \033[1;32m✓\033[0m %s\n" "$*"; }
warn(){ printf "   \033[1;33m!\033[0m %s\n" "$*"; }

# --- 1. Prereqs ---------------------------------------------------------------
say "Checking prerequisites"

case "$(uname -s)" in
  Darwin)
    if ! command -v brew >/dev/null 2>&1; then
      warn "Homebrew not found. Install it first: https://brew.sh"
      exit 1
    fi
    ok "Homebrew present"
    ;;
  Linux)
    ok "Linux detected — will use apt/npm where possible"
    ;;
  *)
    warn "Unsupported OS: $(uname -s). Install gh and node manually."
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  say "Installing Node 20"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    brew install node@20 && brew link --overwrite node@20
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  ok "node $(node -v)"
fi

if ! command -v git >/dev/null 2>&1; then
  warn "git not found — install it and re-run"
  exit 1
fi
ok "git $(git --version | awk '{print $3}')"

# --- 2. CLIs ------------------------------------------------------------------
say "Installing CLIs"

if ! command -v gh >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then brew install gh
  else sudo apt-get install -y gh || { type -p curl >/dev/null && (type -p sudo >/dev/null && sudo install -m 0755 -d /etc/apt/keyrings) && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install gh -y; }
  fi
else
  ok "gh $(gh --version | head -n1 | awk '{print $3}')"
fi

if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
else
  ok "claude $(claude --version 2>/dev/null | head -n1 || echo installed)"
fi

# --- 3. Auth ------------------------------------------------------------------
say "GitHub auth"
if gh auth status >/dev/null 2>&1; then
  ok "gh already authenticated as $(gh api user -q .login)"
else
  warn "Opening browser for gh auth. Accept git-credential setup when asked."
  gh auth login
fi

say "Cloudflare auth (wrangler)"
if npx --yes wrangler@3 whoami >/dev/null 2>&1; then
  ok "wrangler already authenticated ($(npx --yes wrangler@3 whoami 2>/dev/null | grep -E 'email|Account' | head -n1))"
else
  warn "Opening browser for Cloudflare OAuth. Use the account that owns pool-design.pages.dev."
  npx --yes wrangler@3 login
fi

# --- 4. Clone / refresh repo --------------------------------------------------
say "Cloning / refreshing repo into $WORKDIR"

mkdir -p "$(dirname "$WORKDIR")"
if [[ -d "$WORKDIR/.git" ]]; then
  ok "Repo exists — fetching"
  git -C "$WORKDIR" fetch origin
else
  gh repo clone "$REPO" "$WORKDIR"
fi

git -C "$WORKDIR" checkout "$BRANCH" 2>/dev/null || git -C "$WORKDIR" checkout -b "$BRANCH" "origin/$BRANCH"
git -C "$WORKDIR" pull --ff-only origin "$BRANCH" || true
ok "On branch $(git -C "$WORKDIR" rev-parse --abbrev-ref HEAD) @ $(git -C "$WORKDIR" rev-parse --short HEAD)"

# --- 5. Prime Claude with the problem statement -------------------------------
PROMPT_FILE="$WORKDIR/.claude-kickoff.md"
cat >"$PROMPT_FILE" <<'EOF'
Continuing the pool-designer Cloud Functions bug from the web session.
Branch: claude/implement-pool-designer-1Bby3. Last pushed commit: ae83023.

Problem: wrangler pages deploy uploads only the 2 HTML files and silently
skips the pool-designer/functions/ directory — no "Compiled Worker" output,
/api/ping returns HTML instead of JSON, save gets HTTP 405.

You now have gh and wrangler authed locally. Please:

1. gh run list --workflow=deploy-pool-designer.yml -L 3
2. gh run view <latest_id> --log   (grep for 'function', 'Worker', 'Compiled')
3. npx wrangler pages project list
4. npx wrangler pages deployment list --project-name=pool-design
5. Reproduce locally (no upload):
   npx wrangler@3 pages deploy pool-designer \
     --project-name=pool-design --branch=preview --dry-run=true
   Observe whether Functions get bundled.
6. Once you know the cause, fix it, commit to the branch, push, and verify
   curl -fsSL https://pool-design.pages.dev/api/ping returns {"ok":true,...}.

Working dir is this repo. Don't push destructive changes without asking.
EOF
ok "Wrote kickoff prompt to $PROMPT_FILE"

# --- 6. Launch ----------------------------------------------------------------
say "Launching Claude Code"
cd "$WORKDIR"
printf "\nPaste the kickoff prompt above (or run: cat %s) into Claude once it starts.\n\n" "$PROMPT_FILE"
exec claude
