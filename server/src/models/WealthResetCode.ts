import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A short-lived emailed OTP that authorises setting a new Net Worth (wealth)
 * passcode when the old one has been forgotten. Deliberately its own collection
 * rather than reusing the 2FA code: requesting a wealth reset must not burn an
 * in-flight sign-in code (and vice versa). Only the SHA-256 hash of the code is
 * stored, `attempts` burns it after too many wrong guesses, at most one is
 * active per user, and a TTL index sweeps expired docs.
 */
const wealthResetCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Mongo auto-removes documents once expiresAt passes.
wealthResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type WealthResetCodeDoc = InferSchemaType<typeof wealthResetCodeSchema>;
export const WealthResetCode = model("WealthResetCode", wealthResetCodeSchema);
