import type { Request } from "express";
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";
import QRCode from "qrcode";
import { env } from "../config/env";
import { User } from "../models/User";
import { BackupCode } from "../models/BackupCode";
import { TwoFactorEmailCode } from "../models/TwoFactorEmailCode";
import {
  encryptSecret,
  decryptSecret,
  hashCode,
  generateEmailCode,
  generateBackupCodes,
} from "../auth/twoFactorCrypto";
import { verifyPassword } from "../auth/password";
import { sendMail } from "../mail/mailer";
import { renderEmailShell, esc } from "../mail/emailLayout";
import { HttpError } from "../middleware/errorHandler";

// Tolerate ±30s (one time-step either side) of clock drift when verifying TOTP.
const EPOCH_TOLERANCE_SECONDS = 30;

const APP_NAME = "CoinCompass";
export type TwoFactorMethod = "totp" | "email" | "backup";

export interface TwoFactorStatus {
  enabled: boolean;
  emailFallback: boolean;
  backupCodesRemaining: number;
}

/** Load a user or 401 — every 2FA operation is keyed on a known account. */
async function requireUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, "Not authenticated");
  return user;
}

export async function getStatus(userId: string): Promise<TwoFactorStatus> {
  const user = await requireUser(userId);
  const backupCodesRemaining = user.twoFactorEnabled
    ? await BackupCode.countDocuments({ user: userId, usedAt: null })
    : 0;
  return {
    enabled: Boolean(user.twoFactorEnabled),
    emailFallback: Boolean(user.twoFactorEmailFallback),
    backupCodesRemaining,
  };
}

/**
 * Begin TOTP enrollment: generate a fresh secret, stash it (encrypted) as the
 * *pending* secret, and hand back the otpauth URL + a QR data-URL to scan. The
 * secret isn't active until {@link enable} confirms the user can produce a code.
 */
export async function startEnrollment(userId: string): Promise<{ otpauthUrl: string; qrDataUrl: string; secret: string }> {
  const user = await requireUser(userId);
  if (user.twoFactorEnabled) throw new HttpError(409, "Two-factor authentication is already enabled");

  const secret = generateSecret();
  user.twoFactorPendingSecretEnc = encryptSecret(secret);
  await user.save();

  const otpauthUrl = generateURI({ issuer: env.twoFactor.issuer, label: user.email, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrDataUrl, secret };
}

/**
 * Finish enrollment: verify a code against the pending secret, promote it to the
 * active secret, and issue a fresh set of single-use backup codes (returned once).
 */
export async function enable(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const user = await requireUser(userId);
  if (user.twoFactorEnabled) throw new HttpError(409, "Two-factor authentication is already enabled");
  if (!user.twoFactorPendingSecretEnc) throw new HttpError(400, "Start setup before enabling");

  if (!(await verifyTotp(user.twoFactorPendingSecretEnc, code))) {
    throw new HttpError(400, "That code is incorrect or expired. Try again.");
  }

  user.totpSecretEnc = user.twoFactorPendingSecretEnc;
  user.twoFactorPendingSecretEnc = null;
  user.twoFactorEnabled = true;
  await user.save();

  const backupCodes = await regenerateBackupCodesFor(userId);
  return { backupCodes };
}

/**
 * Turn 2FA off. Password accounts must re-enter their password; OAuth-only
 * accounts (no passwordHash) confirm with a live 2FA code instead.
 */
export async function disable(userId: string, currentPassword: string | undefined, code: string | undefined): Promise<void> {
  const user = await requireUser(userId);
  if (!user.twoFactorEnabled) throw new HttpError(400, "Two-factor authentication isn't enabled");

  if (user.passwordHash) {
    if (!currentPassword) throw new HttpError(400, "Your password is required to disable 2FA");
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new HttpError(401, "Password is incorrect");
  } else {
    if (!code || !(await verifyActiveCode(userId, code))) {
      throw new HttpError(401, "A valid authentication code is required to disable 2FA");
    }
  }

  user.twoFactorEnabled = false;
  user.totpSecretEnc = null;
  user.twoFactorPendingSecretEnc = null;
  await user.save();
  await BackupCode.deleteMany({ user: userId });
  await TwoFactorEmailCode.deleteMany({ user: userId });
}

/** Toggle the emailed-OTP fallback on/off for an already-enrolled account. */
export async function setEmailFallback(userId: string, enabled: boolean): Promise<TwoFactorStatus> {
  const user = await requireUser(userId);
  if (!user.twoFactorEnabled) throw new HttpError(400, "Enable two-factor authentication first");
  user.twoFactorEmailFallback = enabled;
  await user.save();
  return getStatus(userId);
}

/** Replace the whole backup-code set after proving a live code. Returns the raw codes once. */
export async function regenerateBackupCodes(userId: string, code: string): Promise<string[]> {
  const user = await requireUser(userId);
  if (!user.twoFactorEnabled) throw new HttpError(400, "Two-factor authentication isn't enabled");
  if (!(await verifyActiveCode(userId, code))) throw new HttpError(401, "That code is incorrect or expired");
  return regenerateBackupCodesFor(userId);
}

async function regenerateBackupCodesFor(userId: string): Promise<string[]> {
  const codes = generateBackupCodes();
  await BackupCode.deleteMany({ user: userId });
  await BackupCode.insertMany(codes.map((c) => ({ user: userId, codeHash: hashCode(c.toLowerCase()) })));
  return codes;
}

/**
 * Generate and email a 6-digit OTP for the fallback factor. One active code per
 * user (older ones dropped). No-ops silently if the account has fallback off, so
 * callers can't probe configuration.
 */
export async function sendEmailCode(userId: string, req?: Request): Promise<void> {
  const user = await requireUser(userId);
  if (!user.twoFactorEnabled || !user.twoFactorEmailFallback) return;

  const code = generateEmailCode();
  const expiresAt = new Date(Date.now() + env.twoFactor.emailCodeTtlMinutes * 60 * 1000);
  await TwoFactorEmailCode.deleteMany({ user: userId });
  await TwoFactorEmailCode.create({ user: userId, codeHash: hashCode(code), expiresAt });

  const name = user.name?.trim() || "there";
  const mins = env.twoFactor.emailCodeTtlMinutes;
  const html = renderEmailShell({
    title: "Your sign-in code",
    bodyHtml:
      `<p style="margin:0 0 8px;font-size:15px;color:#0f172a;">Hi ${esc(name)},</p>` +
      `<p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6;">Use this code to finish signing in to your ${esc(
        APP_NAME
      )} account:</p>` +
      `<div style="text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:#0f172a;">${esc(code)}</div>`,
    footerHtml: `This code expires in ${mins} minute${mins === 1 ? "" : "s"}. If you didn't try to sign in, change your password — someone may know it.`,
  });
  const text =
    `Hi ${name},\n\nYour ${APP_NAME} sign-in code is: ${code}\n\n` +
    `It expires in ${mins} minute${mins === 1 ? "" : "s"}. If you didn't try to sign in, change your password.`;

  await sendMail({ to: user.email, subject: `Your ${APP_NAME} sign-in code`, html, text });
  // Note: req is accepted for symmetry with other mail senders / future use.
  void req;
}

/**
 * Verify a login second factor. Dispatches on method; returns true on success,
 * false on a wrong-but-well-formed code, and throws only for state errors.
 */
export async function verifyLoginCode(userId: string, method: TwoFactorMethod, code: string): Promise<boolean> {
  const user = await requireUser(userId);
  if (!user.twoFactorEnabled) throw new HttpError(400, "Two-factor authentication isn't enabled");

  if (method === "totp") return verifyTotp(user.totpSecretEnc, code);
  if (method === "backup") return verifyBackupCode(userId, code);
  if (method === "email") {
    if (!user.twoFactorEmailFallback) return false;
    return verifyEmailCode(userId, code);
  }
  return false;
}

/** True if `code` is valid for ANY active method — used to gate sensitive changes. */
async function verifyActiveCode(userId: string, code: string): Promise<boolean> {
  const user = await requireUser(userId);
  if (await verifyTotp(user.totpSecretEnc, code)) return true;
  if (await verifyBackupCode(userId, code)) return true;
  return false;
}

async function verifyTotp(secretEnc: string | null | undefined, code: string): Promise<boolean> {
  if (!secretEnc) return false;
  try {
    const result = await verifyOtp({
      secret: decryptSecret(secretEnc),
      token: code.trim(),
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  const record = await BackupCode.findOne({ user: userId, codeHash: hashCode(normalized), usedAt: null });
  if (!record) return false;
  record.usedAt = new Date();
  await record.save();
  return true;
}

async function verifyEmailCode(userId: string, code: string): Promise<boolean> {
  const record = await TwoFactorEmailCode.findOne({ user: userId });
  if (!record) return false;
  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    return false;
  }
  if (record.attempts >= env.twoFactor.emailCodeMaxAttempts) {
    await record.deleteOne();
    throw new HttpError(429, "Too many attempts. Request a new code.");
  }
  if (record.codeHash !== hashCode(code.trim())) {
    record.attempts += 1;
    await record.save();
    return false;
  }
  await record.deleteOne();
  return true;
}
