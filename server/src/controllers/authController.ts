import type { Request, Response } from "express";
import { signupSchema, signinSchema, verifyEmailSchema } from "../validators/schemas";
import { signupWithPassword, signinWithPassword } from "../services/authService";
import {
  sendVerificationEmail,
  verifyEmailToken,
  resendVerificationEmail,
} from "../services/emailVerificationService";
import { setSessionCookie, clearSessionCookie } from "../auth/cookie";
import { verifyPassword } from "../auth/password";
import type { SessionMode } from "../auth/jwt";
import { User, type UserDoc } from "../models/User";
import { getSettings } from "../models/Settings";
import { userId } from "../middleware/auth";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

/** Shape returned to the client — never includes passwordHash. Carries the current
 *  view `mode` and whether the wealth lock is enabled so the client can gate the UI. */
function publicUser(u: UserDoc & { _id: unknown }, mode: SessionMode = "user", wealthLockEnabled = false) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    emailVerified: u.emailVerified,
    // Personalisation bits for the account/settings screen.
    createdAt: (u as { createdAt?: Date }).createdAt?.toISOString() ?? null,
    hasPassword: Boolean(u.passwordHash),
    mode,
    wealthLockEnabled,
  };
}

async function wealthLockEnabledFor(uid: string): Promise<boolean> {
  const settings = await getSettings(uid);
  return Boolean(settings.wealthPasscodeHash);
}

export async function signup(req: Request, res: Response) {
  const data = signupSchema.parse(req.body);
  const user = await signupWithPassword(data);
  // Log them in immediately, but emailVerified is false so the app gates them
  // onto the "verify your email" screen until they click the emailed link.
  setSessionCookie(res, String(user._id));
  res.status(201).json({ user: publicUser(user) });
  // Send the verification email out-of-band: don't make the user wait on the SMTP
  // round-trip, and don't fail an otherwise-successful signup if mail hiccups —
  // they land on the verify screen and can hit "Resend" there.
  void sendVerificationEmail(user).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[signup] verification email failed for", user.email, e);
  });
}

/**
 * Confirm an email from the link's token. Public (the token is the credential).
 * On success we (re)issue a session so clicking the link also signs the user in.
 */
export async function verifyEmail(req: Request, res: Response) {
  const { token } = verifyEmailSchema.parse(req.body);
  const user = await verifyEmailToken(token);
  setSessionCookie(res, String(user._id));
  res.json({ user: publicUser(user, "user", await wealthLockEnabledFor(String(user._id))) });
}

/** Resend the verification email to the signed-in (but unverified) user. */
export async function resendVerification(req: Request, res: Response) {
  await resendVerificationEmail(userId(req));
  res.json({ ok: true });
}

export async function signin(req: Request, res: Response) {
  const data = signinSchema.parse(req.body);
  const user = await signinWithPassword(data);
  // Every fresh login starts in the everyday `user` view; wealth is unlocked separately.
  setSessionCookie(res, String(user._id));
  res.json({ user: publicUser(user, "user", await wealthLockEnabledFor(String(user._id))) });
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  const uid = userId(req);
  const user = await User.findById(uid);
  if (!user) throw new HttpError(401, "Not authenticated");
  res.json({ user: publicUser(user, req.mode ?? "user", await wealthLockEnabledFor(uid)) });
}

/** Enter superadmin (wealth) mode by supplying the wealth passcode. Re-issues the session. */
export async function unlockWealth(req: Request, res: Response) {
  const uid = userId(req);
  const passcode = String(req.body?.passcode ?? "");
  const settings = await getSettings(uid);
  if (settings.wealthPasscodeHash) {
    const ok = await verifyPassword(passcode, settings.wealthPasscodeHash);
    if (!ok) throw new HttpError(401, "Incorrect passcode");
  }
  setSessionCookie(res, uid, "superadmin");
  const user = await User.findById(uid);
  if (!user) throw new HttpError(401, "Not authenticated");
  res.json({ user: publicUser(user, "superadmin", Boolean(settings.wealthPasscodeHash)) });
}

/** Return to the everyday `user` view (re-hides wealth). Re-issues the session. */
export async function lockWealth(req: Request, res: Response) {
  const uid = userId(req);
  setSessionCookie(res, uid, "user");
  const user = await User.findById(uid);
  if (!user) throw new HttpError(401, "Not authenticated");
  res.json({ user: publicUser(user, "user", await wealthLockEnabledFor(uid)) });
}

/** Which OAuth providers are configured (so the client only shows working buttons). */
export function providersStatus(_req: Request, res: Response) {
  res.json({
    google: env.oauth.google.configured,
    github: env.oauth.github.configured,
    microsoft: env.oauth.microsoft.configured,
    apple: env.oauth.apple.configured,
  });
}
