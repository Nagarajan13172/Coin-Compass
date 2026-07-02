import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Crypto helpers for two-factor auth:
 *  - TOTP secrets are encrypted at rest with AES-256-GCM so a leaked database
 *    alone can't reconstruct them (the key lives in the environment).
 *  - Backup codes and emailed OTPs are only ever stored as SHA-256 hashes.
 */

/** Derive a stable 32-byte AES key from the configured secret. */
function encryptionKey(): Buffer {
  // Prefer the dedicated key; fall back to the JWT secret in dev so 2FA works
  // out of the box. Either way we hash to a fixed 32 bytes for AES-256.
  const raw = env.twoFactor.encKey || env.auth.jwtSecret;
  return crypto.createHash("sha256").update(raw).digest();
}

/** Encrypt a TOTP secret → "iv:tag:ciphertext" (all base64url). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(":");
}

/** Decrypt a value produced by {@link encryptSecret}; throws if tampered. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** SHA-256 hex hash for backup codes and emailed OTPs. */
export function hashCode(raw: string): string {
  return crypto.createHash("sha256").update(raw.trim()).digest("hex");
}

/** A 6-digit numeric OTP for email fallback (zero-padded). */
export function generateEmailCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Generate N human-friendly backup codes formatted "xxxx-xxxx" (Crockford-ish
 * lowercase alphanumerics, no ambiguous 0/o/1/l). Returns the raw codes (shown
 * once) — hash them with {@link hashCode} before storing.
 */
export function generateBackupCodes(count = env.twoFactor.backupCodeCount): string[] {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
  return Array.from({ length: count }, () => `${group()}-${group()}`);
}
