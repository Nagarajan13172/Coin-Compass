import { Schema, model, type InferSchemaType } from "mongoose";

export const BUDGET_PERIODS = ["weekly", "monthly", "yearly"] as const;

const budgetSchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null }, // null = overall budget
    amount: { type: Number, required: true, min: 0 },
    period: { type: String, enum: BUDGET_PERIODS, default: "monthly" },
    startDate: { type: Date, default: Date.now },
    rollover: { type: Boolean, default: false },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

export type BudgetDoc = InferSchemaType<typeof budgetSchema>;
export const Budget = model("Budget", budgetSchema);
