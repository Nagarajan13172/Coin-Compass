import { Schema, model, type InferSchemaType } from "mongoose";
import { AUTH_PROVIDERS } from "./User";

/** Links an external OAuth account to a local user (one row per provider login). */
const authIdentitySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: AUTH_PROVIDERS, required: true },
    providerAccountId: { type: String, required: true },
  },
  { timestamps: true }
);

authIdentitySchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });

export type AuthIdentityDoc = InferSchemaType<typeof authIdentitySchema>;
export const AuthIdentity = model("AuthIdentity", authIdentitySchema);
