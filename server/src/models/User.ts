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
    // Idempotency guard for scheduled report emails: the last "YYYY-MM-DD" a report
    // was sent, so a boot/cron double-run on the same day can't send twice.
    lastReportKey: { type: String, default: "" },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
