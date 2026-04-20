import type { Env } from "./types";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}
export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

export async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  const res = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("telegram sendMessage failed", res.status, body);
  }
}

export async function sendChatAction(env: Env, chatId: number, action: "typing" = "typing"): Promise<void> {
  await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}
