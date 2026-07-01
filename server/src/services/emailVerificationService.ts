import crypto from "node:crypto";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { User, type UserDoc } from "../models/User";
import { EmailVerificationToken } from "../models/EmailVerificationToken";
import { sendMail } from "../mail/mailer";
import { HttpError } from "../middleware/errorHandler";

const TTL_MS = env.auth.emailTokenTtlHours * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Issue a fresh verification token for a user, invalidating any earlier ones,
 * and email them the verification link. Returns the raw token (handy for tests /
 * for logging when SMTP is off). No-op-safe to call on every signup or resend.
 */
export async function sendVerificationEmail(user: UserDoc & { _id: Types.ObjectId | unknown }): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_MS);

  // One active link per user: drop older tokens before creating the new one.
  await EmailVerificationToken.deleteMany({ user: user._id });
  await EmailVerificationToken.create({ user: user._id, tokenHash, expiresAt });

  const link = `${env.appUrl}/verify-email?token=${raw}`;
  const name = user.name?.trim() || "there";
  await sendMail({
    to: user.email,
    subject: "Verify your email for Money Tracker",
    text:
      `Hi ${name},\n\n` +
      `Confirm your email address to finish setting up your Money Tracker account:\n\n` +
      `${link}\n\n` +
      `This link expires in ${env.auth.emailTokenTtlHours} hours. ` +
      `If you didn't create this account, you can ignore this email.`,
    html:
      `<p>Hi ${name},</p>` +
      `<p>Confirm your email address to finish setting up your Money Tracker account:</p>` +
      `<p><a href="${link}">Verify my email</a></p>` +
      `<p style="color:#64748b;font-size:13px">This link expires in ${env.auth.emailTokenTtlHours} hours. ` +
      `If you didn't create this account, you can ignore this email.</p>`,
  });

  return raw;
}

/**
 * Consume a raw verification token: mark the owning user verified and delete the
 * token (and any siblings). Returns the now-verified user. Throws on bad/expired token.
 */
export async function verifyEmailToken(raw: string): Promise<UserDoc & { _id: Types.ObjectId }> {
  if (!raw) throw new HttpError(400, "Missing verification token");
  const tokenHash = hashToken(raw);
  const record = await EmailVerificationToken.findOne({ tokenHash });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "This verification link is invalid or has expired");
  }

  const user = await User.findById(record.user);
  if (!user) {
    await EmailVerificationToken.deleteMany({ user: record.user });
    throw new HttpError(400, "This verification link is invalid or has expired");
  }

  if (!user.emailVerified) {
    user.emailVerified = true;
    await user.save();
  }
  await EmailVerificationToken.deleteMany({ user: user._id });

  return user as UserDoc & { _id: Types.ObjectId };
}

/** Resend a verification email for a user by id; no-op if already verified. */
export async function resendVerificationEmail(userIdValue: string): Promise<void> {
  const user = await User.findById(userIdValue);
  if (!user) throw new HttpError(404, "User not found");
  if (user.emailVerified) return;
  await sendVerificationEmail(user);
}
