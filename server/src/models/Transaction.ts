import { Schema, model, type InferSchemaType } from "mongoose";

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;

const transactionSchema = new Schema(
  {
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

transactionSchema.index({ date: -1 });
transactionSchema.index({ account: 1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ recurring: 1 });

export type TransactionDoc = InferSchemaType<typeof transactionSchema>;
export const Transaction = model("Transaction", transactionSchema);
