import { Schema, model, type InferSchemaType } from "mongoose";

const currencySchema = new Schema(
  {
    code: { type: String, required: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    rateToBase: { type: Number, required: true, default: 1 },
  },
  { _id: false }
);

const settingsSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, default: "My Wallet" },
    description: { type: String, default: "" }, // optional label/tag, e.g. "Personal finances"
    baseCurrency: { type: String, default: "INR" },
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    locale: { type: String, default: "en-IN" }, // Intl locale for number/date formatting
    language: { type: String, enum: ["en", "ta"], default: "en" }, // UI text language
    firstDayOfWeek: { type: Number, default: 1 }, // 0 = Sunday, 1 = Monday
    monthStartDay: { type: Number, default: 1 },
    currencies: {
      type: [currencySchema],
      default: [
        { code: "INR", symbol: "₹", name: "Indian Rupee", rateToBase: 1 },
        { code: "USD", symbol: "$", name: "US Dollar", rateToBase: 83 },
        { code: "EUR", symbol: "€", name: "Euro", rateToBase: 90 },
        { code: "GBP", symbol: "£", name: "British Pound", rateToBase: 105 },
      ],
    },
    pinEnabled: { type: Boolean, default: false },
    pinHash: { type: String, default: null },
    // Email a summary report on the 1st (last month) and 15th (month-to-date).
    emailReports: { type: Boolean, default: true },
    // When set, the Net Worth section is hidden ("user" view) until the passcode is
    // entered ("superadmin" view). Null = wealth lock off (Net Worth always visible).
    wealthPasscodeHash: { type: String, default: null },
    // Auto-capture payments (MacroDroid/SMS → the /api/ingest webhook). The token is
    // stored only as a SHA-256 hash; `ingestTokenHint` is the last 4 chars for display.
    // Captured payments land in `ingestDefaultAccount` (a UPI account by default).
    ingestEnabled: { type: Boolean, default: false },
    ingestTokenHash: { type: String, default: null },
    ingestTokenHint: { type: String, default: null },
    ingestDefaultAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { timestamps: true }
);

// Reverse lookup: the ingest webhook finds the owner by hashed token.
settingsSchema.index({ ingestTokenHash: 1 }, { sparse: true });

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const Settings = model("Settings", settingsSchema);

/** Each user has exactly one settings document; create it lazily if missing. */
export async function getSettings(userId: string) {
  let doc = await Settings.findOne({ user: userId });
  if (!doc) doc = await Settings.create({ user: userId });
  return doc;
}
