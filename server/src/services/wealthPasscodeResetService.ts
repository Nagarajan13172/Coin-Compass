import type { Request } from "express";
import { env } from "../config/env";
import { User } from "../models/User";
import { getSettings } from "../models/Settings";
import { WealthResetCode } from "../models/WealthResetCode";
import { generateEmailCode, hashCode } from "../auth/twoFactorCrypto";
import { hashPassword } from "../auth/password";
import { sendMail } from "../mail/mailer";
import { renderEmailShell, esc } from "../mail/emailLayout";
import { maskEmail } from "../utils/maskEmail";
import { HttpError } from "../middleware/errorHandler";

/**
 * Recovery for a forgotten Net Worth passcode. Without this the lock is a
 * one-way door: changing or clearing the passcode needs superadmin, which needs
 * the passcode. The escape hatch is an OTP mailed to the (already verified)
 * account address, so proving control of the inbox — not merely holding the
 * signed-in session — is what lifts the lock.
 */

const APP_NAME = "CoinCompass";

/** Load the account behind the session, or 401. */
async function requireUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, "Not authenticated");
  return user;
}

/** The settings doc, but only once a lock actually exists to reset. */
async function requireLocked(userId: string) {
  const settings = await getSettings(userId);
  if (!settings.wealthPasscodeHash) {
    throw new HttpError(400, "The Net Worth lock isn't enabled", "WEALTH_LOCK_NOT_ENABLED");
  }
  return settings;
}

/**
 * Mail a fresh 6-digit reset code, replacing any earlier one. Returns the masked
 * address so the client can say where the code went without exposing it in full.
 */
export async function requestWealthPasscodeReset(userId: string, req?: Request): Promise<{ email: string }> {
  await requireLocked(userId);
  const user = await requireUser(userId);

  const code = generateEmailCode();
  const mins = env.wealthReset.codeTtlMinutes;
  const expiresAt = new Date(Date.now() + mins * 60 * 1000);
  await WealthResetCode.deleteMany({ user: userId });
  await WealthResetCode.create({ user: userId, codeHash: hashCode(code), expiresAt });

  const name = user.name?.trim() || "there";
  const html = renderEmailShell({
    title: "Reset your Net Worth passcode",
    bodyHtml:
      `<p style="margin:0 0 8px;font-size:15px;color:#0f172a;">Hi ${esc(name)},</p>` +
      `<p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6;">Use this code to choose a new passcode for the Net Worth section of your ${esc(
        APP_NAME
      )} account:</p>` +
      `<div style="text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:#0f172a;">${esc(code)}</div>`,
    footerHtml:
      `This code expires in ${mins} minute${mins === 1 ? "" : "s"}. If you didn't ask for it, ignore this email — ` +
      `your passcode stays as it is. Someone using your signed-in device may be trying to reveal your Net Worth, so it's worth signing out elsewhere and changing your password.`,
  });
  const text =
    `Hi ${name},\n\nYour ${APP_NAME} Net Worth passcode reset code is: ${code}\n\n` +
    `It expires in ${mins} minute${mins === 1 ? "" : "s"}. If you didn't ask for it, ignore this email — your passcode stays as it is.`;

  await sendMail({ to: user.email, subject: `Reset your Net Worth passcode for ${APP_NAME}`, html, text });
  // Accepted for symmetry with the other mail senders / future use.
  void req;
  return { email: maskEmail(user.email) };
}

/**
 * Consume the emailed code and set `passcode` as the new wealth passcode. Throws
 * on a wrong, expired, or over-attempted code; the caller elevates the session
 * only once this resolves.
 */
export async function consumeWealthPasscodeReset(
  userId: string,
  code: string,
  passcode: string
): Promise<void> {
  if (passcode.length < 4 || passcode.length > 32) {
    throw new HttpError(400, "Passcode must be 4-32 characters");
  }
  const settings = await requireLocked(userId);

  const record = await WealthResetCode.findOne({ user: userId });
  if (!record) throw new HttpError(401, "That code is incorrect or expired");
  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    throw new HttpError(401, "That code is incorrect or expired");
  }
  if (record.attempts >= env.wealthReset.codeMaxAttempts) {
    await record.deleteOne();
    throw new HttpError(429, "Too many attempts. Request a new code.");
  }
  if (record.codeHash !== hashCode(code.trim())) {
    record.attempts += 1;
    await record.save();
    throw new HttpError(401, "That code is incorrect or expired");
  }

  await record.deleteOne();
  settings.wealthPasscodeHash = await hashPassword(passcode);
  await settings.save();
}
