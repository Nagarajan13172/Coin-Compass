import { Schema, model, type InferSchemaType } from "mongoose";

export const ACCOUNT_TYPES = ["cash", "bank", "card", "wallet", "upi", "savings"] as const;

const accountSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ACCOUNT_TYPES, default: "cash" },
    initialBalance: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    color: { type: String, default: "#2563EB" },
    icon: { type: String, default: "wallet" },
    includeInTotal: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type AccountDoc = InferSchemaType<typeof accountSchema>;
export const Account = model("Account", accountSchema);
