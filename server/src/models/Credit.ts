import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Which way the money went, across both sides of an informal debt:
 *
 *   given    — you lent them money        → they owe you   (receivable ↑)
 *   received — they paid you back         → they owe less  (receivable ↓)
 *   borrowed — they lent to you, or paid for something you got → you owe (payable ↑)
 *   repaid   — you paid them back         → you owe less   (payable ↓)
 *
 * The first two are the asset side ("Money Lent"), the last two the liability
 * side ("Money Owed"). Keeping all four on one model means one person has ONE
 * balance however the money moved — see personOutstanding.
 */
export const CREDIT_DIRECTIONS = ["given", "received", "borrowed", "repaid"] as const;
export type CreditDirection = (typeof CREDIT_DIRECTIONS)[number];

/** Directions where money leaves you (or a debt to you is created). */
export const OUTFLOW_DIRECTIONS = ["given", "repaid"] as const;

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
    // The person's name AS ENTERED, kept as a historical snapshot. `personRef` is
    // the identity the ledger groups by; this survives so an entry still reads
    // correctly if its person is force-deleted, and so the pre-Person backfill
    // can never lose data.
    person: { type: String, required: true, trim: true },
    // The Person this entry belongs to. Null only on entries that predate the
    // People registry (until `backfill:people` runs) or whose person was
    // force-deleted — both fall back to grouping by the `person` string.
    personRef: { type: Schema.Types.ObjectId, ref: "Person", default: null },
    direction: { type: String, enum: CREDIT_DIRECTIONS, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    // How the money moved (GPay/PhonePe/Cash/…) — a record label, not a balance.
    method: { type: String, default: "" },
    // The account whose balance moves — only set/needed when `reflected` is on.
    account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    // On `borrowed`: the expense category, set when they paid for something you
    // CONSUMED rather than handing you cash. Stored (not just on the posted
    // transaction) so re-opening the entry restores which kind of borrow it was.
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    note: { type: String, default: "", trim: true },
    reflected: { type: Boolean, default: false },
    // The primary reflected transaction — a TRANSFER between the user's real
    // account and the auto-managed "Money Lent" account, so lending/repaying
    // moves balances without ever counting as income/expense (see creditService).
    transaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    // The SECOND leg, present only when a "received" exceeds what the person owed:
    // the excess is genuine income (interest/gift) and gets its own income txn.
    incomeTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    // Set when this credit is one person's share of a split bill (see Split /
    // splitService). The credit still behaves exactly like a hand-entered IOU —
    // this only records where it came from, so the split can rebuild its legs
    // and the ledger can group them into one row.
    split: { type: Schema.Types.ObjectId, ref: "Split", default: null },
    // On a "received" entry: the specific lend this repayment pays down, set when
    // settling one entry rather than the person's whole balance. Null = a general
    // payment, which spills across their open lends oldest-first. A dangling
    // reference (its lend was deleted) simply reverts to general — see
    // allocateOutstanding in creditService.
    settles: { type: Schema.Types.ObjectId, ref: "Credit", default: null },
  },
  { timestamps: true }
);

creditSchema.index({ user: 1, person: 1 });
creditSchema.index({ user: 1, personRef: 1 });
creditSchema.index({ user: 1, date: -1 });

export type CreditDoc = InferSchemaType<typeof creditSchema>;
export const Credit = model("Credit", creditSchema);
