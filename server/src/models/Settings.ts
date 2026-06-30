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
    name: { type: String, default: "My Wallet" },
    baseCurrency: { type: String, default: "INR" },
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    locale: { type: String, default: "en-IN" },
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
  },
  { timestamps: true }
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const Settings = model("Settings", settingsSchema);

/** There is only ever one settings document. */
export async function getSettings() {
  let doc = await Settings.findOne();
  if (!doc) doc = await Settings.create({});
  return doc;
}
