import crypto from "node:crypto";
import type { Types } from "mongoose";
import type { Request } from "express";
import { env } from "../config/env";
import { User, type UserDoc } from "../models/User";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { sendMail } from "../mail/mailer";
import { renderEmailShell, esc } from "../mail/emailLayout";
import { hashPassword } from "../auth/password";
import { HttpError } from "../middleware/errorHandler";
import { publicAppOrigin } from "../utils/publicOrigin";

const TTL_MS = env.auth.passwordResetTtlHours * 60 * 60 * 1000;
const APP_NAME = "CoinCompass";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function ttlLabel(): string {
  const h = env.auth.passwordResetTtlHours;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/**
 * Email a password-reset link when the address belongs to an account. Never
 * throws for an unknown email — the controller always returns a generic
 * "check your inbox" response so this can't be used to enumerate accounts.
 */
export async function requestPasswordReset(email: string, req?: Request): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return;

  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_MS);

  // One active link per user: drop older tokens before creating the new one.
  await PasswordResetToken.deleteMany({ user: user._id });
  await PasswordResetToken.create({ user: user._id, tokenHash, expiresAt });

  const link = new URL("/reset-password", `${publicAppOrigin(req)}/`);
  link.searchParams.set("token", raw);
  const name = user.name?.trim() || "there";

  const html = renderEmailShell({
    title: "Reset your password",
    bodyHtml:
      `<p style="margin:0 0 8px;font-size:15px;color:#0f172a;">Hi ${esc(name)},</p>` +
      `<p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">We received a request to reset the password for your ${esc(
        APP_NAME
      )} account. Click below to choose a new one.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: link.toString(),
    footerHtml: `This link expires in ${ttlLabel()}. If you didn't request this, you can safely ignore this email — your password stays unchanged.`,
  });
  const text =
    `Hi ${name},\n\n` +
    `We received a request to reset the password for your ${APP_NAME} account:\n\n` +
    `${link.toString()}\n\n` +
    `This link expires in ${ttlLabel()}. If you didn't request this, you can ignore this email.`;

  await sendMail({ to: user.email, subject: `Reset your password for ${APP_NAME}`, html, text });
}

/** Consume a raw reset token: set the new password and invalidate the token. */
export async function consumePasswordReset(
  raw: string,
  newPassword: string
): Promise<UserDoc & { _id: Types.ObjectId }> {
  if (!raw) throw new HttpError(400, "Missing reset token");
  const tokenHash = hashToken(raw);
  const record = await PasswordResetToken.findOne({ tokenHash });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "This reset link is invalid or has expired");
  }

  const user = await User.findById(record.user);
  if (!user) {
    await PasswordResetToken.deleteMany({ user: record.user });
    throw new HttpError(400, "This reset link is invalid or has expired");
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await PasswordResetToken.deleteMany({ user: user._id });

  return user as UserDoc & { _id: Types.ObjectId };
}
