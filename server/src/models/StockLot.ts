import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * One purchase of one instrument — a "lot". Positions are tracked per lot rather
 * than as a single averaged row because two questions need the individual buy
 * dates: which shares have crossed the 12-month long-term capital gains line, and
 * which cost basis a FIFO sale should consume.
 *
 * `qty` is what was bought and never changes; `qtyRemaining` is what a sale
 * decrements. Keeping both means a lot's own history is never rewritten, and a
 * deleted sale can restore exactly what it consumed.
 */
const stockLotSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    instrument: { type: Schema.Types.ObjectId, ref: "Instrument", required: true },
    /** Denormalised so listing a portfolio never needs to populate instruments. */
    symbol: { type: String, required: true, trim: true },
    /** The demat account these shares sit in. */
    demat: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    qty: { type: Number, required: true, min: 0 },
    qtyRemaining: { type: Number, required: true, min: 0 },
    buyPrice: { type: Number, required: true, min: 0 }, // per share, excluding fees
    buyDate: { type: Date, required: true },
    /** Brokerage + STT + stamp duty + GST — a real cost, so it enters cost basis. */
    fees: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", trim: true },
    currency: { type: String, default: "INR" },
    // "open" while any quantity remains; "closed" once fully sold. Derived from
    // qtyRemaining on every write so the two can never disagree.
    status: { type: String, enum: ["open", "closed"], default: "open" },
    /**
     * The ledger transfer (demat cash → Securities) recording this purchase.
     * Null when the lot was recorded without a cash leg — an opening balance for
     * shares bought before the user started tracking here.
     */
    buyTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

// Portfolio reads are user-scoped and filter to open lots, oldest first (FIFO).
stockLotSchema.index({ user: 1, symbol: 1, buyDate: 1 });
stockLotSchema.index({ user: 1, status: 1 });

export type StockLotDoc = InferSchemaType<typeof stockLotSchema>;
export const StockLot = model("StockLot", stockLotSchema);
