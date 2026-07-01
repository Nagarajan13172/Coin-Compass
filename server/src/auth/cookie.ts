import type { Response } from "express";
import { env } from "../config/env";
import { signSession } from "./jwt";

const MAX_AGE_MS = env.auth.sessionTtlDays * 24 * 60 * 60 * 1000;

/** Issue a fresh session cookie for the given user. */
export function setSessionCookie(res: Response, userId: string): void {
  res.cookie(env.auth.cookieName, signSession(userId), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.auth.cookieName, { path: "/" });
}
