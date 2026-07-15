import { Schema, model, type InferSchemaType } from "mongoose";

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

const recurringSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // transaction template
    type: { type: String, enum: ["income", "expense", "transfer"], required: true },
    amount: { type: Number, required: true, min: 0 },
    account: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    toAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    note: { type: String, default: "" },
    payee: { type: String, default: "" },
    tags: { type: [String], default: [] },
    currency: { type: String, default: "INR" },
    // When set, each posted occurrence reduces this loan's outstanding (e.g. an EMI).
    loan: { type: Schema.Types.ObjectId, ref: "Loan", default: null },
    // When set, each posted occurrence adds its amount to this savings goal's progress
    // (e.g. a monthly auto-debit that also counts toward a "Car Insurance" goal).
    goal: { type: Schema.Types.ObjectId, ref: "Goal", default: null },
    // recurrence rule
    frequency: { type: String, enum: RECURRENCE_FREQUENCIES, default: "monthly" },
    interval: { type: Number, default: 1, min: 1 }, // every N frequency units
    startDate: { type: Date, required: true, default: Date.now },
    nextRun: { type: Date, required: true, default: Date.now },
    endDate: { type: Date, default: null },
    lastRun: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type RecurringDoc = InferSchemaType<typeof recurringSchema>;
export const RecurringTransaction = model("RecurringTransaction", recurringSchema);
