import type { Response } from "express";
import { env } from "../config/env";
import { signSession, type SessionMode } from "./jwt";

const REMEMBER_MAX_AGE_MS = env.auth.rememberTtlDays * 24 * 60 * 60 * 1000;

/**
 * Issue a fresh session cookie for the given user (defaults to the `user` view
 * mode, remembered). `remember` controls persistence: remembered sessions get
 * a long-lived cookie (matters for PWAs, which have no browser chrome to fall
 * back on and shouldn't force a re-login every visit); declining it issues a
 * browser-session cookie (no maxAge) that clears when the browser fully closes.
 */
export function setSessionCookie(
  res: Response,
  userId: string,
  mode: SessionMode = "user",
  remember = true
): void {
  res.cookie(env.auth.cookieName, signSession(userId, mode, remember), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MAX_AGE_MS } : {}),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.auth.cookieName, { path: "/" });
}
