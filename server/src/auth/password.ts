import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { env } from "../config/env";

const ROUNDS = 12;

// Marks a hash whose plaintext was HMAC-"peppered" before bcrypt. Hashes without
// this tag are legacy plain-bcrypt — created before a pepper was configured — and
// are still verified normally, then upgraded to a peppered hash on the next
// successful login (see needsRehash + the call sites in authService/authController).
// bcrypt output always begins with "$2…", so the tag is never ambiguous.
const PEPPER_TAG = "pmac1$";

/** Whether an application-level pepper is configured (see env.auth.passwordPepper). */
export function pepperEnabled(): boolean {
  return env.auth.passwordPepper.length > 0;
}

/**
 * HMAC-SHA256 the secret with the pepper key, base64-encoded. Pre-hashing to a
 * fixed 44-char ASCII string keeps us clear of bcrypt's 72-byte input limit and
 * its NUL-byte truncation, while binding the hash to a key that lives only in the
 * environment — so a leaked database alone can't be brute-forced offline.
 */
function applyPepper(plain: string): string {
  return crypto
    .createHmac("sha256", env.auth.passwordPepper)
    .update(plain, "utf8")
    .digest("base64");
}

/** Hash a password/passcode for storage. Peppered + tagged when a pepper is set. */
export async function hashPassword(plain: string): Promise<string> {
  if (!pepperEnabled()) return bcrypt.hash(plain, ROUNDS);
  return PEPPER_TAG + (await bcrypt.hash(applyPepper(plain), ROUNDS));
}

/** Verify a plaintext against a stored hash — handles both peppered and legacy hashes. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith(PEPPER_TAG)) {
    // Peppered hash: the pepper is mandatory to verify. If it's been removed the
    // hash is intentionally unverifiable — that's the at-rest protection working.
    if (!pepperEnabled()) return false;
    return bcrypt.compare(applyPepper(plain), stored.slice(PEPPER_TAG.length));
  }
  // Legacy plain-bcrypt hash.
  return bcrypt.compare(plain, stored);
}

/**
 * True when a just-verified hash should be re-hashed to adopt the configured
 * pepper (i.e. a pepper is set but this hash predates it). Call sites re-hash the
 * plaintext they already hold and persist it, migrating users transparently.
 */
export function needsRehash(stored: string): boolean {
  return pepperEnabled() && !stored.startsWith(PEPPER_TAG);
}
