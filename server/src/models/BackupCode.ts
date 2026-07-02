import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A single-use two-factor recovery code. We store only the SHA-256 hash; the
 * raw codes are shown to the user exactly once at generation time. A code is
 * spent (not deleted) by stamping `usedAt`, so the UI can show how many remain.
 * Regenerating replaces the whole set for that user.
 */
const backupCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    codeHash: { type: String, required: true, unique: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type BackupCodeDoc = InferSchemaType<typeof backupCodeSchema>;
export const BackupCode = model("BackupCode", backupCodeSchema);
