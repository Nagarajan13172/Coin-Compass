import type { Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * The short-lived "password accepted, second factor still required" token. It
 * is issued between the two login steps and authorizes ONLY the 2FA-verify /
 * email-send endpoints — never a full session. Kept separate from the session
 * JWT (jwt.ts) so a pending token can't be mistaken for an authenticated one.
 */
export interface PendingSession {
  sub: string;
  purpose: "2fa";
  remember: boolean;
}

const TTL_SECONDS = env.twoFactor.pendingTtlMinutes * 60;

export function signPending(userId: string, remember: boolean): string {
  return jwt.sign({ sub: userId, purpose: "2fa", remember }, env.auth.jwtSecret, {
    expiresIn: TTL_SECONDS,
  });
}

export function verifyPending(token: string): PendingSession | null {
  try {
    const p = jwt.verify(token, env.auth.jwtSecret) as {
      sub?: string;
      purpose?: string;
      remember?: boolean;
    };
    if (!p.sub || p.purpose !== "2fa") return null;
    return { sub: p.sub, purpose: "2fa", remember: Boolean(p.remember) };
  } catch {
    return null;
  }
}

/** Issue the pending cookie (httpOnly, short-lived, no persistent maxAge). */
export function setPendingCookie(res: Response, userId: string, remember: boolean): void {
  res.cookie(env.twoFactor.pendingCookieName, signPending(userId, remember), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS * 1000,
  });
}

export function clearPendingCookie(res: Response): void {
  res.clearCookie(env.twoFactor.pendingCookieName, { path: "/" });
}
