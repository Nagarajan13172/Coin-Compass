import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A daily snapshot of one instrument's price, in INR. Global — the market price
 * is the same for every user — so there is no `user` field. One document per
 * (symbol, date); the portfolio's value history is built by accumulating these.
 *
 * Deliberately shaped like MetalPrice: the upstream quote endpoint refuses batch
 * requests (HTTP 401), so every symbol costs one round trip. Sharing one row
 * across all users is what keeps that fan-out bounded by the symbols anyone
 * actually holds rather than by the user count.
 */
const stockPriceSchema = new Schema(
  {
    symbol: { type: String, required: true, trim: true },
    currency: { type: String, default: "INR" },
    date: { type: String, required: true }, // YYYY-MM-DD in IST (the market day)
    close: { type: Number, required: true },
    prevClose: { type: Number, default: 0 },
    change: { type: Number, default: 0 }, // absolute day-over-day move
    changePct: { type: Number, default: 0 },
    dayHigh: { type: Number, default: 0 },
    dayLow: { type: Number, default: 0 },
    week52High: { type: Number, default: 0 },
    week52Low: { type: Number, default: 0 },
    volume: { type: Number, default: 0 },
    source: { type: String, default: "" },
    fetchedAt: { type: Date, default: Date.now },
    /**
     * True when this row was carried forward from an earlier day rather than
     * captured live — a failed fetch, or a market holiday. The client greys the
     * price and shows when it was actually from, so a Friday close is never
     * dressed up as a live quote.
     */
    stale: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One snapshot per symbol per day; also the index behind "latest" and history.
stockPriceSchema.index({ symbol: 1, date: -1 }, { unique: true });

export type StockPriceDoc = InferSchemaType<typeof stockPriceSchema>;
export const StockPrice = model("StockPrice", stockPriceSchema);
