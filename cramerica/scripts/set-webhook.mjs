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

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
