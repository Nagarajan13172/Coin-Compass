import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A single-use email-verification token. We store only the SHA-256 hash of the
 * token; the raw value lives only in the emailed link. Expired docs are swept by
 * a TTL index. At most one active token per user (older ones are deleted on reissue).
 */
const emailVerificationTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Mongo auto-removes documents once expiresAt passes.
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailVerificationTokenDoc = InferSchemaType<typeof emailVerificationTokenSchema>;
export const EmailVerificationToken = model("EmailVerificationToken", emailVerificationTokenSchema);
