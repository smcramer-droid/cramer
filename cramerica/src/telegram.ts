import type { Env } from "./types";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
}
export interface TgCallbackQuery {
  id: string;
  from: { id: number; first_name?: string };
  message?: TgMessage & { reply_markup?: InlineKeyboardMarkup };
  data?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
}
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  opts?: { reply_markup?: InlineKeyboardMarkup }
): Promise<{ message_id: number } | null> {
  const res = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: opts?.reply_markup,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("telegram sendMessage failed", res.status, body);
    return null;
  }
  const j = await res.json<{ ok: boolean; result?: { message_id: number } }>();
  return j.result ?? null;
}

export async function sendChatAction(env: Env, chatId: number, action: "typing" = "typing"): Promise<void> {
  await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}

export async function answerCallbackQuery(
  env: Env,
  callbackId: string,
  text?: string
): Promise<void> {
  await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text, show_alert: false }),
  }).catch(() => {});
}

export async function editReplyMarkup(
  env: Env,
  chatId: number,
  messageId: number,
  reply_markup: InlineKeyboardMarkup | null
): Promise<void> {
  await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: reply_markup ?? { inline_keyboard: [] },
    }),
  }).catch(() => {});
}
