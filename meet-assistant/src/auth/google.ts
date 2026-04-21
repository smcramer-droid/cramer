import { google } from "googleapis";
import { config, oauthRedirect } from "../config.js";
import { tokens } from "../db.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function googleClient() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    oauthRedirect.google,
  );
}

export function authUrl(): string {
  return googleClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleCallback(code: string): Promise<string> {
  const client = googleClient();
  const { tokens: t } = await client.getToken(code);
  client.setCredentials(t);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  const email = profile.email;
  if (!email) throw new Error("Google did not return an email for the account");

  tokens.upsert({
    provider: "google",
    user_email: email,
    access_token: t.access_token!,
    refresh_token: t.refresh_token ?? null,
    expires_at: t.expiry_date ? new Date(t.expiry_date).toISOString() : null,
    scope: t.scope ?? SCOPES.join(" "),
    updated_at: new Date().toISOString(),
  });
  return email;
}

export function authedClient(user_email: string) {
  const stored = tokens.get("google", user_email);
  if (!stored) {
    throw new Error(`No Google tokens stored for ${user_email}. Visit /oauth/google to connect.`);
  }
  const client = googleClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token ?? undefined,
    expiry_date: stored.expires_at ? new Date(stored.expires_at).getTime() : undefined,
  });
  client.on("tokens", (t) => {
    tokens.upsert({
      provider: "google",
      user_email,
      access_token: t.access_token ?? stored.access_token,
      refresh_token: t.refresh_token ?? stored.refresh_token,
      expires_at: t.expiry_date ? new Date(t.expiry_date).toISOString() : stored.expires_at,
      scope: t.scope ?? stored.scope,
      updated_at: new Date().toISOString(),
    });
  });
  return client;
}
