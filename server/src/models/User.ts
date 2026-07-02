import { Schema, model, type InferSchemaType } from "mongoose";

export const AUTH_PROVIDERS = ["google", "github", "microsoft", "apple"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: "", trim: true },
    avatarUrl: { type: String, default: "" },
    // null for OAuth-only accounts that never set a password
    passwordHash: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    // ---- Two-factor authentication (opt-in) ----
    twoFactorEnabled: { type: Boolean, default: false },
    // TOTP secret, AES-256-GCM encrypted at rest (never stored plaintext). Null
    // until enrollment completes. See auth/twoFactorCrypto.ts.
    totpSecretEnc: { type: String, default: null },
    // The freshly-generated secret while the user is mid-enrollment, before they
    // confirm a code. Promoted to totpSecretEnc on enable; cleared on cancel.
    twoFactorPendingSecretEnc: { type: String, default: null },
    // Whether an emailed OTP is offered as a fallback factor at login.
    twoFactorEmailFallback: { type: Boolean, default: true },
    // Idempotency guard for scheduled report emails: the last "YYYY-MM-DD" a report
    // was sent, so a boot/cron double-run on the same day can't send twice.
    lastReportKey: { type: String, default: "" },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
