import { Schema, model, type InferSchemaType } from "mongoose";

/** A savings goal: target amount, what's saved so far, and an optional plan. */
const goalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    savedAmount: { type: Number, default: 0, min: 0 },
    targetDate: { type: Date, default: null },
    // Optional planned monthly saving — used to estimate time-to-goal.
    monthlyContribution: { type: Number, default: 0, min: 0 },
    color: { type: String, default: "#6366F1" },
    icon: { type: String, default: "goal" },
    currency: { type: String, default: "INR" },
    achievedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type GoalDoc = InferSchemaType<typeof goalSchema>;
export const Goal = model("Goal", goalSchema);
