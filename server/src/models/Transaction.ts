import { Schema, model, type InferSchemaType } from "mongoose";

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;

const transactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amount: { type: Number, required: true, min: 0 },
    account: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    toAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null }, // transfers only
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null }, // null for transfers
    date: { type: Date, required: true, default: Date.now },
    note: { type: String, default: "", trim: true },
    payee: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
    currency: { type: String, default: "INR" },
    // Set when this transaction was auto-posted by a recurring rule (null for manual entries).
    recurring: { type: Schema.Types.ObjectId, ref: "RecurringTransaction", default: null },
  },
  { timestamps: true }
);

// All reads are user-scoped, so lead every index with `user`.
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, account: 1 });
transactionSchema.index({ user: 1, category: 1 });
transactionSchema.index({ user: 1, type: 1 });
transactionSchema.index({ user: 1, recurring: 1 });

export type TransactionDoc = InferSchemaType<typeof transactionSchema>;
export const Transaction = model("Transaction", transactionSchema);
