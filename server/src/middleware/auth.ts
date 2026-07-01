import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { verifySession, type SessionMode } from "../auth/jwt";
import { User } from "../models/User";
import { Settings } from "../models/Settings";
import { HttpError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      mode?: SessionMode;
    }
  }
}

/** Gate a route on a valid session cookie; populates req.userId + req.mode or throws 401. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.auth.cookieName];
  const session = token ? verifySession(token) : null;
  if (!session) throw new HttpError(401, "Not authenticated");
  req.userId = session.sub;
  req.mode = session.mode;
  next();
}

/**
 * Whether the caller may see the wealth (Net Worth) section: true when they're in
 * `superadmin` mode, OR when they simply haven't turned on the wealth lock.
 */
export async function canSeeWealth(req: Request): Promise<boolean> {
  if (req.mode === "superadmin") return true;
  const s = await Settings.findOne({ user: userId(req) }).select("wealthPasscodeHash").lean();
  return !s?.wealthPasscodeHash;
}

/** Gate wealth routes: 403 when the wealth lock is on and the caller isn't superadmin. */
export async function requireWealthAccess(req: Request, _res: Response, next: NextFunction) {
  if (await canSeeWealth(req)) return next();
  throw new HttpError(403, "The Net Worth section is locked");
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
