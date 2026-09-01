import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * One purchase of one scheme — a lot, exactly as StockLot is for equities. Every
 * SIP installment is its own lot, which is the whole point: each has its own buy
 * date (its own long-term clock) and its own cost basis for a FIFO redemption.
 *
 * `units` is what was bought and never changes; `unitsRemaining` is what a
 * redemption decrements. Units are fractional by nature — ₹5,000 at ₹443.12 buys
 * 11.284 units — so quantities keep six decimals rather than being rounded to
 * paise scale.
 */
const fundLotSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fund: { type: Schema.Types.ObjectId, ref: "Fund", required: true },
    /** Denormalised so listing a portfolio never needs to populate funds. */
    schemeCode: { type: String, required: true, trim: true },
    units: { type: Number, required: true, min: 0 },
    unitsRemaining: { type: Number, required: true, min: 0 },
    /** NAV per unit at allotment, excluding charges. */
    buyNav: { type: Number, required: true, min: 0 },
    buyDate: { type: Date, required: true },
    /** Stamp duty and any transaction charge — a real cost, so it enters basis. */
    fees: { type: Number, default: 0, min: 0 },
    /** The AMC folio this sits in. A label only: funds need no account here. */
    folio: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    /**
     * The ledger transfer (paying account → Securities) recording this purchase.
     * Null for an opening balance — units bought before tracking started here.
     */
    buyTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    /** The SIP rule that created this installment, when it wasn't bought by hand. */
    sip: { type: Schema.Types.ObjectId, ref: "RecurringTransaction", default: null },
    /**
     * Which day's NAV was used. A SIP posting on the 5th is priced at the last
     * NAV AMFI had published, which may be the 4th — worth recording, because the
     * AMC may allot at a different one and the user can correct it.
     */
    navDate: { type: Date, default: null },
  },
  { timestamps: true }
);

fundLotSchema.index({ user: 1, schemeCode: 1, buyDate: 1 });

export type FundLotDoc = InferSchemaType<typeof fundLotSchema>;
export const FundLot = model("FundLot", fundLotSchema);
