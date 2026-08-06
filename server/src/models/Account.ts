import { Schema, model, type InferSchemaType } from "mongoose";

// "receivable" and "payable" are auto-managed buckets, not spendable accounts the
// user creates:
//   receivable — "Money Lent",  money owed TO you by other people (an asset)
//   payable    — "Money Owed",  money YOU owe other people (a liability; its
//                balance runs negative, which is what drags net worth down)
//   demat      — a broker account. Its BALANCE is only the idle cash sitting
//                there; the shares are StockLots valued at market price (see
//                portfolioService). Keeping the two apart is what stops a funded
//                demat account from being counted twice — once as cash and again
//                as stock — in net worth.
//   securities — auto-managed, one per user. Holds the cost basis of open lots so
//                a purchase stays a balanced transfer instead of vanishing from
//                the ledger. Excluded from totals (includeInTotal: false) because
//                the lots supply the market value; see ensureSecuritiesAccount.
export const ACCOUNT_TYPES = [
  "cash",
  "bank",
  "card",
  "wallet",
  "upi",
  "savings",
  "receivable",
  "payable",
  "demat",
  "securities",
] as const;

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
