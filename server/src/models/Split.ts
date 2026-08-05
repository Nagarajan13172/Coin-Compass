import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A bill you paid that several people shared — the "Splitwise" case: you put
 * ₹3,000 on the table at KFC for six, of which only your own share was really
 * your spending.
 *
 * The split itself stores the BILL-level facts. Per-person amounts deliberately
 * live on the Credit entries that reference this split (Credit.split), so there
 * is a single source of truth for what each person owes and settlement keeps
 * flowing through the existing creditService rules. See splitService for the
 * ledger legs a split posts.
 */
const splitSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    description: { type: String, required: true, trim: true },
    // The full bill — what actually left the paying account.
    totalAmount: { type: Number, required: true, min: 0 },
    // The part you consumed. ONLY this reaches a budget or a spend report.
    yourShare: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    // The account that paid the whole bill. Null when SOMEONE ELSE paid — no
    // account of yours was touched.
    account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    // Set when a friend paid the bill instead of you: their name. Your share then
    // becomes an expense funded by "Money Owed" (you owe them), and there are no
    // participants owing you — see splitService.
    paidBy: { type: String, default: "", trim: true },
    // Categorises your share only (the others' shares are a receivable, not spend).
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    // How the money moved (GPay/Cash/…) — a record label, as on Credit.
    method: { type: String, default: "" },
    note: { type: String, default: "", trim: true },
    // The expense transaction for `yourShare`; null when your share was 0
    // (you paid purely on others' behalf).
    expenseTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

splitSchema.index({ user: 1, date: -1 });

export type SplitDoc = InferSchemaType<typeof splitSchema>;
export const Split = model("Split", splitSchema);
