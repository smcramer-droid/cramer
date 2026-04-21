import { request } from "undici";
import { config, oauthRedirect } from "../config.js";
import { tokens } from "../db.js";

const AUTH_URL = "https://ticktick.com/oauth/authorize";
const TOKEN_URL = "https://ticktick.com/oauth/token";
const SCOPES = ["tasks:write", "tasks:read"];

export function authUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.TICKTICK_CLIENT_ID,
    response_type: "code",
    scope: SCOPES.join(" "),
    redirect_uri: oauthRedirect.ticktick,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

async function exchange(params: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(
    `${config.TICKTICK_CLIENT_ID}:${config.TICKTICK_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await request(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`TickTick token exchange failed ${res.statusCode}: ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function handleCallback(code: string): Promise<void> {
  const t = await exchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthRedirect.ticktick,
      scope: SCOPES.join(" "),
    }),
  );
  persistToken(t);
}

function persistToken(t: TokenResponse) {
  tokens.upsert({
    provider: "ticktick",
    user_email: config.USER_EMAIL,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? SCOPES.join(" "),
    updated_at: new Date().toISOString(),
  });
}

export async function getAccessToken(): Promise<string> {
  const stored = tokens.get("ticktick", config.USER_EMAIL);
  if (!stored) {
    throw new Error("No TickTick tokens stored. Visit /oauth/ticktick to connect.");
  }
  const expiry = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  if (expiry - Date.now() > 60_000) return stored.access_token;

  if (!stored.refresh_token) {
    throw new Error("TickTick token expired and no refresh token is stored; re-auth at /oauth/ticktick.");
  }
  const t = await exchange(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
      scope: SCOPES.join(" "),
    }),
  );
  if (!t.refresh_token) t.refresh_token = stored.refresh_token;
  persistToken(t);
  return t.access_token;
}
