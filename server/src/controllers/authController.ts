import type { Request, Response } from "express";
import {
  signupSchema,
  signinSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  enable2faSchema,
  verify2faSchema,
  disable2faSchema,
  regenerateBackupCodesSchema,
  emailFallbackSchema,
} from "../validators/schemas";
import { signupWithPassword, signinWithPassword, changePassword as changePasswordService } from "../services/authService";
import {
  sendVerificationEmail,
  verifyEmailToken,
  resendVerificationEmail,
} from "../services/emailVerificationService";
import { requestPasswordReset, consumePasswordReset } from "../services/passwordResetService";
import * as twoFactor from "../services/twoFactorService";
import { setSessionCookie, clearSessionCookie } from "../auth/cookie";
import { setPendingCookie, clearPendingCookie, verifyPending, type PendingSession } from "../auth/pending2fa";
import { verifyPassword, hashPassword, needsRehash } from "../auth/password";
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
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    mode,
    wealthLockEnabled,
  };
}

/** The available factors advertised to the client for a 2FA-enabled account. */
function factorsFor(u: { twoFactorEmailFallback?: boolean | null }): string[] {
  return ["totp", ...(u.twoFactorEmailFallback ? ["email"] : [])];
}

/** Obscure an email for the 2FA screen: "jo•••@gmail.com". */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

/** Read + validate the short-lived pending-2FA cookie, or 401. */
function readPending(req: Request): PendingSession {
  const token = req.cookies?.[env.twoFactor.pendingCookieName];
  const pending = token ? verifyPending(token) : null;
  if (!pending) throw new HttpError(401, "Your sign-in session expired. Please sign in again.");
  return pending;
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
  void sendVerificationEmail(user, req).catch((e) => {
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
  await resendVerificationEmail(userId(req), req);
  res.json({ ok: true });
}

/**
 * Email a password-reset link if the address has an account. Always responds
 * the same way — doesn't reveal whether the email exists.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await requestPasswordReset(email, req);
  res.json({ ok: true });
}

/** Consume a reset token, set the new password, and sign the user in. */
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const user = await consumePasswordReset(token, password);
  setSessionCookie(res, String(user._id));
  res.json({ user: publicUser(user, "user", await wealthLockEnabledFor(String(user._id))) });
}

/** Change the signed-in user's password (or set one for the first time on an OAuth-only account). */
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await changePasswordService(userId(req), currentPassword, newPassword);
  res.json({ ok: true });
}

export async function signin(req: Request, res: Response) {
  const data = signinSchema.parse(req.body);
  const user = await signinWithPassword(data);
  // 2FA-enabled accounts stop here: password is proven but no session is issued
  // yet. We hand out a short-lived pending cookie that only authorizes the
  // /auth/2fa/* endpoints, and the client collects the second factor.
  if (user.twoFactorEnabled) {
    setPendingCookie(res, String(user._id), data.remember);
    res.json({ requires2fa: true, methods: factorsFor(user) });
    return;
  }
  // Every fresh login starts in the everyday `user` view; wealth is unlocked separately.
  setSessionCookie(res, String(user._id), "user", data.remember);
  res.json({ user: publicUser(user, "user", await wealthLockEnabledFor(String(user._id))) });
}

// ---- Two-factor: login (pending) phase — authenticated by the mt_2fa cookie ----

/** Describe the in-progress 2FA challenge so the client can render the right options. */
export async function twoFactorPending(req: Request, res: Response) {
  const pending = readPending(req);
  const user = await User.findById(pending.sub).select("email twoFactorEnabled twoFactorEmailFallback");
  if (!user || !user.twoFactorEnabled) {
    throw new HttpError(401, "Your sign-in session expired. Please sign in again.");
  }
  res.json({ email: maskEmail(user.email), methods: factorsFor(user) });
}

/** Email a one-time code for the fallback factor (pending phase). */
export async function sendTwoFactorEmail(req: Request, res: Response) {
  const pending = readPending(req);
  await twoFactor.sendEmailCode(pending.sub, req);
  res.json({ ok: true });
}

/** Verify the second factor; on success clear the pending cookie and issue the real session. */
export async function verifyTwoFactor(req: Request, res: Response) {
  const pending = readPending(req);
  const { method, code } = verify2faSchema.parse(req.body);
  const ok = await twoFactor.verifyLoginCode(pending.sub, method, code);
  if (!ok) throw new HttpError(401, "That code is incorrect or expired");

  clearPendingCookie(res);
  setSessionCookie(res, pending.sub, "user", pending.remember);
  const user = await User.findById(pending.sub);
  if (!user) throw new HttpError(401, "Not authenticated");
  res.json({ user: publicUser(user, "user", await wealthLockEnabledFor(pending.sub)) });
}

// ---- Two-factor: management (requires an authenticated, verified session) ----

export async function twoFactorStatus(req: Request, res: Response) {
  res.json(await twoFactor.getStatus(userId(req)));
}

/** Begin enrollment: returns the otpauth URL + QR to scan. */
export async function twoFactorSetup(req: Request, res: Response) {
  res.json(await twoFactor.startEnrollment(userId(req)));
}

/** Confirm the first code, turn 2FA on, and return the one-time backup codes. */
export async function twoFactorEnable(req: Request, res: Response) {
  const { code } = enable2faSchema.parse(req.body);
  res.json(await twoFactor.enable(userId(req), code));
}

/** Turn 2FA off (password re-entry, or a live code for OAuth-only accounts). */
export async function twoFactorDisable(req: Request, res: Response) {
  const { currentPassword, code } = disable2faSchema.parse(req.body);
  await twoFactor.disable(userId(req), currentPassword, code);
  res.json({ ok: true });
}

/** Toggle the emailed-OTP fallback for an enrolled account. */
export async function twoFactorEmailFallback(req: Request, res: Response) {
  const { enabled } = emailFallbackSchema.parse(req.body);
  res.json(await twoFactor.setEmailFallback(userId(req), enabled));
}

/** Regenerate the backup-code set (requires a live code). Returns new codes once. */
export async function regenerateBackupCodes(req: Request, res: Response) {
  const { code } = regenerateBackupCodesSchema.parse(req.body);
  res.json({ backupCodes: await twoFactor.regenerateBackupCodes(userId(req), code) });
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
    // Migrate a legacy passcode hash to the peppered scheme on a correct unlock.
    if (needsRehash(settings.wealthPasscodeHash)) {
      settings.wealthPasscodeHash = await hashPassword(passcode);
      await settings.save();
    }
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
