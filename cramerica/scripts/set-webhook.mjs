#!/usr/bin/env node
// Register the Telegram webhook with the deployed Worker.
// Usage: BOT_TOKEN=... WEBHOOK_URL=https://cramerica.<you>.workers.dev/webhook \
//        WEBHOOK_SECRET=... node scripts/set-webhook.mjs

const token = process.env.BOT_TOKEN;
const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!token || !url || !secret) {
  console.error("Set BOT_TOKEN, WEBHOOK_URL, WEBHOOK_SECRET env vars.");
  process.exit(1);
}

const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;
const body = {
  url,
  secret_token: secret,
  allowed_updates: ["message", "edited_message", "callback_query"],
  drop_pending_updates: true,
};

// Redacted diagnostics before we call.
const redactedToken = token.length > 8
  ? `${token.slice(0, 6)}…(len ${token.length})`
  : "(too short)";
console.log(`→ setWebhook url=${url} tokenPrefix=${redactedToken}`);

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`← ${res.status} ${text}`);

if (!res.ok) {
  try {
    const parsed = JSON.parse(text);
    if (parsed.error_code === 404) {
      console.error("\n  → Telegram returned 404. This almost always means the bot token is wrong.");
      console.error("  → Verify it by visiting: https://api.telegram.org/bot<TOKEN>/getMe");
      console.error("  → If that returns ok:true, paste THAT exact token into the setup prompt.");
    } else if (parsed.error_code === 400 && /url/i.test(parsed.description ?? "")) {
      console.error("\n  → Telegram rejected the webhook URL. Check it resolves to HTTPS and is reachable.");
    }
  } catch {}
  process.exit(1);
}
