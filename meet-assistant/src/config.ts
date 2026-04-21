import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  PUBLIC_URL: z.string().url(),
  USER_EMAIL: z.string().email(),
  USER_DISPLAY_NAME: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  RECALL_API_KEY: z.string().min(1),
  RECALL_BOT_NAME: z.string().default("Meet Assistant"),
  RECALL_WEBHOOK_SECRET: z.string().min(8),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  TICKTICK_CLIENT_ID: z.string().min(1),
  TICKTICK_CLIENT_SECRET: z.string().min(1),
  DB_PATH: z.string().default("./data/meet-assistant.db"),
});

export const config = schema.parse(process.env);

export const oauthRedirect = {
  google: `${config.PUBLIC_URL}/oauth/google/callback`,
  ticktick: `${config.PUBLIC_URL}/oauth/ticktick/callback`,
};
