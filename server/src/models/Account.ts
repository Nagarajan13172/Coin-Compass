import { Schema, model, type InferSchemaType } from "mongoose";

// "receivable" is an auto-managed asset bucket (currently "Money Lent"), not a
// spendable account the user creates — money owed TO the user by other people.
export const ACCOUNT_TYPES = ["cash", "bank", "card", "wallet", "upi", "savings", "receivable"] as const;

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
    // Marks an app-managed account the user didn't create by hand — currently the
    // Credits feature's "Money Lent" receivable ("money_lent"). Lets the app
    // find/reuse the same bucket and lets the client hide it from spend pickers.
    // null for ordinary user accounts. Mirrors Category.system.
    system: { type: String, default: null },
  },
  { timestamps: true }
);

export type AccountDoc = InferSchemaType<typeof accountSchema>;
export const Account = model("Account", accountSchema);
