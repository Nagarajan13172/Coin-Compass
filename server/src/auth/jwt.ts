import jwt from "jsonwebtoken";
import { env } from "../config/env";

/** Sign a session JWT identifying the user. */
export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, env.auth.jwtSecret, {
    expiresIn: `${env.auth.sessionTtlDays}d`,
  });
}

/** Verify a session JWT; returns the user id or null if invalid/expired. */
export function verifySession(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.auth.jwtSecret) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
