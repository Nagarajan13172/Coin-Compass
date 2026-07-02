import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A short-lived emailed OTP used as the 2FA fallback factor at login. We store
 * only the SHA-256 hash of the numeric code; the raw code lives only in the
 * email. `attempts` counts wrong guesses so the code can be burned after too
 * many. At most one active code per user (older ones are deleted on reissue),
 * and expired docs are swept by a TTL index.
 */
const twoFactorEmailCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Mongo auto-removes documents once expiresAt passes.
twoFactorEmailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type TwoFactorEmailCodeDoc = InferSchemaType<typeof twoFactorEmailCodeSchema>;
export const TwoFactorEmailCode = model("TwoFactorEmailCode", twoFactorEmailCodeSchema);
