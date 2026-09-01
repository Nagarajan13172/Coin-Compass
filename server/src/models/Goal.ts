import { Schema, model, type InferSchemaType } from "mongoose";

/** A savings goal: target amount, what's saved so far, and an optional plan. */
const goalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    // What's been put aside. For a goal that tracks an account this is only a
    // snapshot of the last known balance — the live figure is derived from that
    // account's transactions, so a deposit into the wallet moves the goal by
    // itself and nothing has to be recorded against the goal twice.
    savedAmount: { type: Number, default: 0, min: 0 },
    // The wallet this goal tracks, if any. Progress then IS that account's
    // balance: pay in and the goal advances, withdraw and it falls back.
    linkedAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null },
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

// One account funds at most one goal — two goals reading the same balance would
// each show the same rupees as theirs. Partial, so the many null links don't collide.
goalSchema.index(
  { user: 1, linkedAccount: 1 },
  { unique: true, partialFilterExpression: { linkedAccount: { $type: "objectId" } } }
);

export type GoalDoc = InferSchemaType<typeof goalSchema>;
export const Goal = model("Goal", goalSchema);
