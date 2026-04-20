import type { Env } from "./types";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}
export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
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

export async function sendPhoto(
  env: Env,
  chatId: number,
  photoUrl: string,
  caption?: string
): Promise<void> {
  const res = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) {
    console.error("telegram sendPhoto failed", res.status, await res.text());
  }
}

export async function fetchPhotoBytes(env: Env, fileId: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const gf = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/getFile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!gf.ok) {
    console.error("getFile failed", gf.status, await gf.text());
    return null;
  }
  const j = await gf.json<{ ok: boolean; result?: { file_path?: string } }>();
  const path = j.result?.file_path;
  if (!path) return null;
  const dl = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`);
  if (!dl.ok) {
    console.error("file download failed", dl.status);
    return null;
  }
  const bytes = await dl.arrayBuffer();
  // Telegram photos are JPEG. If extension suggests PNG, honor it.
  const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return { bytes, mime };
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
