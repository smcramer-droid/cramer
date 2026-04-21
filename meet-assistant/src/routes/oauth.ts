import { Router } from "express";
import { randomBytes } from "node:crypto";
import * as googleAuth from "../auth/google.js";
import * as ticktickAuth from "../auth/ticktick.js";

export const oauthRouter = Router();

const ticktickStates = new Set<string>();

oauthRouter.get("/oauth/google", (_req, res) => {
  res.redirect(googleAuth.authUrl());
});

oauthRouter.get("/oauth/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send("missing code");
  try {
    const email = await googleAuth.handleCallback(code);
    res.send(`Google connected for ${email}. You can close this tab.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`OAuth failed: ${msg}`);
  }
});

oauthRouter.get("/oauth/ticktick", (_req, res) => {
  const state = randomBytes(16).toString("hex");
  ticktickStates.add(state);
  setTimeout(() => ticktickStates.delete(state), 10 * 60_000).unref();
  res.redirect(ticktickAuth.authUrl(state));
});

oauthRouter.get("/oauth/ticktick/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code || !state || !ticktickStates.has(state)) {
    return res.status(400).send("missing or invalid code/state");
  }
  ticktickStates.delete(state);
  try {
    await ticktickAuth.handleCallback(code);
    res.send("TickTick connected. You can close this tab.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`OAuth failed: ${msg}`);
  }
});
