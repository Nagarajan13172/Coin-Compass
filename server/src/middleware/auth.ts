import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { verifySession } from "../auth/jwt";
import { User } from "../models/User";
import { HttpError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Gate a route on a valid session cookie; populates req.userId or throws 401. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.auth.cookieName];
  const userId = token ? verifySession(token) : null;
  if (!userId) throw new HttpError(401, "Not authenticated");
  req.userId = userId;
  next();
}

/**
 * Gate a route on a *verified* email. Runs after requireAuth. Loads the user's
 * verified flag fresh (a cheap indexed _id lookup) so it's never stale — the
 * client already redirects unverified users to /verify-email; this is the
 * server-side backstop. Responds 403 so the client can distinguish it from a
 * 401 (which would bounce to /login).
 */
export async function requireVerified(req: Request, _res: Response, next: NextFunction) {
  const user = await User.findById(userId(req)).select("emailVerified").lean();
  if (!user) throw new HttpError(401, "Not authenticated");
  if (!user.emailVerified) throw new HttpError(403, "Please verify your email to continue");
  next();
}

/** Convenience accessor: the authenticated user id (requireAuth guarantees it). */
export function userId(req: Request): string {
  if (!req.userId) throw new HttpError(401, "Not authenticated");
  return req.userId;
}
