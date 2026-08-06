import { Schema, model, type InferSchemaType } from "mongoose";

/** Indian capital-gains classes: listed equity turns long-term after 12 months. */
export const GAIN_TYPES = ["STCG", "LTCG"] as const;
export type GainType = (typeof GAIN_TYPES)[number];

/**
 * Which lots a sale consumed, and at what cost. Recorded explicitly rather than
 * recomputed on demand for the same reason loanPrincipal is stored on a loan
 * repayment: an edit or delete must reverse exactly what was applied. Re-running
 * FIFO to undo a sale drifts the moment any other lot has changed since.
 */
const allocationSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: "StockLot", required: true },
    qty: { type: Number, required: true, min: 0 },
    /** Cost of exactly this slice: qty × buyPrice + the lot's pro-rata fees. */
    costBasis: { type: Number, required: true, min: 0 },
    buyDate: { type: Date, required: true },
    gainType: { type: String, enum: GAIN_TYPES, required: true },
  },
  { _id: false }
);

/** One sale of one instrument, allocated across the lots it consumed (FIFO). */
const stockSaleSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    instrument: { type: Schema.Types.ObjectId, ref: "Instrument", required: true },
    symbol: { type: String, required: true, trim: true },
    demat: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    qty: { type: Number, required: true, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 }, // per share, excluding fees
    sellDate: { type: Date, required: true },
    fees: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", trim: true },
    currency: { type: String, default: "INR" },
    allocations: { type: [allocationSchema], default: [] },
    /** proceeds − allocated cost basis − sale fees. Negative on a loss. */
    realizedPL: { type: Number, default: 0 },
    /** The realized gain split by holding period, for tax reporting. */
    realizedShortTerm: { type: Number, default: 0 },
    realizedLongTerm: { type: Number, default: 0 },
    /** Ledger legs: capital returned to demat cash, and the gain/loss booked. */
    saleTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    gainTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

stockSaleSchema.index({ user: 1, sellDate: -1 });

export type StockSaleDoc = InferSchemaType<typeof stockSaleSchema>;
export const StockSale = model("StockSale", stockSaleSchema);
