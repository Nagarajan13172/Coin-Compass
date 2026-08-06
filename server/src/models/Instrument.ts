import { Schema, model, type InferSchemaType } from "mongoose";

/** Exchanges we price. Yahoo suffixes these as `.NS` / `.BO`. */
export const EXCHANGES = ["NSE", "BSE"] as const;
export type Exchange = (typeof EXCHANGES)[number];

/**
 * A tradable instrument, cached from the upstream symbol search. Global — a
 * ticker means the same thing for every user — so there is no `user` field, and
 * two users holding RELIANCE share one row (mirrors MetalPrice).
 *
 * Everything here is descriptive metadata; nothing about a user's position lives
 * on it. `symbol` is the resolved upstream symbol (e.g. "RELIANCE.NS"), never a
 * value the user typed: numeric BSE scrip codes resolve to the wrong instrument
 * upstream, so symbols only ever enter the app via searchInstruments().
 */
const instrumentSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, trim: true }, // "RELIANCE.NS"
    /** The bare ticker without the exchange suffix — what a user recognises. */
    ticker: { type: String, required: true, trim: true }, // "RELIANCE"
    exchange: { type: String, enum: EXCHANGES, required: true },
    shortName: { type: String, default: "", trim: true },
    longName: { type: String, default: "", trim: true },
    sector: { type: String, default: "", trim: true },
    industry: { type: String, default: "", trim: true },
    // Only INR instruments are accepted (see assertTradableInINR); stored so a
    // mis-resolved symbol is visible in the data rather than silently valued.
    currency: { type: String, default: "INR" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type InstrumentDoc = InferSchemaType<typeof instrumentSchema>;
export const Instrument = model("Instrument", instrumentSchema);
