import jwt from "jsonwebtoken";
import { env } from "../config/env";

/** Session mode: `superadmin` may see the wealth (Net Worth) section; `user` may not. */
export type SessionMode = "user" | "superadmin";
export interface Session {
  sub: string;
  mode: SessionMode;
}

/** Sign a session JWT identifying the user and their current view mode. */
export function signSession(userId: string, mode: SessionMode = "user"): string {
  return jwt.sign({ sub: userId, mode }, env.auth.jwtSecret, {
    expiresIn: `${env.auth.sessionTtlDays}d`,
  });
}

/** Verify a session JWT; returns { sub, mode } or null if invalid/expired. */
export function verifySession(token: string): Session | null {
  try {
    const payload = jwt.verify(token, env.auth.jwtSecret) as { sub?: string; mode?: string };
    if (!payload.sub) return null;
    return { sub: payload.sub, mode: payload.mode === "superadmin" ? "superadmin" : "user" };
  } catch {
    return null;
  }
}
