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
    // Irregular / one-off spend (AC service, repairs, an annual fee): a real
    // expense, but one that doesn't recur monthly. Tracked separately so a lumpy
    // month can be split into "regular" vs "one-off" and kept out of the user's
    // typical monthly run-rate. Applies to income/expense; never to transfers.
    oneoff: { type: Boolean, default: false },
    currency: { type: String, default: "INR" },
    // Set when this transaction was auto-posted by a recurring rule (null for manual entries).
    recurring: { type: Schema.Types.ObjectId, ref: "RecurringTransaction", default: null },
    // A loan repayment: when set, this transaction's PRINCIPAL portion reduces the
    // loan's outstanding. `loanPrincipal` records how much principal it applied, so
    // an edit/delete can reverse exactly what was applied.
    loan: { type: Schema.Types.ObjectId, ref: "Loan", default: null },
    loanPrincipal: { type: Number, default: 0 }, // principal this payment applied
    loanInterest: { type: Number, default: 0 }, // interest portion of this payment
    // An informal credit (money to/from a person): set when this transaction was
    // created from — or linked to — a Credit entry. See creditService.
    credit: { type: Schema.Types.ObjectId, ref: "Credit", default: null },
    // A savings-goal contribution: when set, this transaction's amount was added to
    // the goal's saved total. `goalContribution` records how much was applied, so an
    // edit/delete can reverse exactly what was applied (mirrors loan/loanPrincipal).
    goal: { type: Schema.Types.ObjectId, ref: "Goal", default: null },
    goalContribution: { type: Number, default: 0 },
    // Soft delete: when set, the row is in the "Recently deleted" trash — hidden
    // from every read (see hooks below) and hard-purged after the retention window.
    // Only side-effect-free transactions are soft-deleted; loan/credit-linked ones
    // are still removed permanently (their stored effects can't be cleanly restored).
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// All reads are user-scoped, so lead every index with `user`.
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, account: 1 });
transactionSchema.index({ user: 1, category: 1 });
transactionSchema.index({ user: 1, type: 1 });
transactionSchema.index({ user: 1, recurring: 1 });
// Trash listing + purge sweep scan by deletion time.
transactionSchema.index({ user: 1, deletedAt: 1 });

// --- Soft delete: hide trashed rows from every read unless the caller explicitly
// opts in with `.setOptions({ withDeleted: true })` (used by the trash list, restore,
// and purge). `{ deletedAt: null }` also matches legacy docs that predate the field,
// so no backfill migration is needed. ---
function excludeDeleted(this: any, next: (err?: Error) => void) {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  next();
}
transactionSchema.pre(/^find/, excludeDeleted);
transactionSchema.pre("countDocuments", excludeDeleted);
transactionSchema.pre("distinct", excludeDeleted);
transactionSchema.pre("aggregate", function (this: any, next: (err?: Error) => void) {
  if (!this.options?.withDeleted) this.pipeline().unshift({ $match: { deletedAt: null } });
  next();
});

export type TransactionDoc = InferSchemaType<typeof transactionSchema>;
export const Transaction = model("Transaction", transactionSchema);
