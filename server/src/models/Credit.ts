import { Schema, model, type InferSchemaType } from "mongoose";

export const CREDIT_DIRECTIONS = ["given", "received"] as const;
export type CreditDirection = (typeof CREDIT_DIRECTIONS)[number];

/**
 * Payment channels — how the money moved (the app/instrument), as a record
 * label. Distinct from `account` (which balance actually moves): e.g. GPay and
 * PhonePe are different channels that both draw from the same bank account.
 */
export const CREDIT_METHODS = [
  "Cash",
  "GPay",
  "PhonePe",
  "Paytm",
  "UPI",
  "Net Banking",
  "Debit Card",
  "Credit Card",
  "Cheque",
  "Bank Transfer",
  "Other",
] as const;

/**
 * An informal IOU with a friend or family member — money given (they owe you)
 * or received (you owe them). Optionally linked to a Transaction (see
 * `transaction`) when `reflected` is true, so it also moves a real account
 * balance; see creditService for how the two stay in sync.
 */
const creditSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    person: { type: String, required: true, trim: true },
    direction: { type: String, enum: CREDIT_DIRECTIONS, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    // How the money moved (GPay/PhonePe/Cash/…) — a record label, not a balance.
    method: { type: String, default: "" },
    // The account whose balance moves — only set/needed when `reflected` is on.
    account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    note: { type: String, default: "", trim: true },
    reflected: { type: Boolean, default: false },
    transaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

creditSchema.index({ user: 1, person: 1 });
creditSchema.index({ user: 1, date: -1 });

export type CreditDoc = InferSchemaType<typeof creditSchema>;
export const Credit = model("Credit", creditSchema);
