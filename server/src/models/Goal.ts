import { Schema, model, type InferSchemaType } from "mongoose";
import { GOAL_REPEATS } from "../services/goalCycles";

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
    // A sinking fund repeats: save the target by the due date, spend it, start
    // again. "none" is an ordinary one-time goal that stays finished.
    repeat: { type: String, enum: GOAL_REPEATS, default: "none" },
    // Which run of a repeating goal is in progress (1-based).
    cycleCount: { type: Number, default: 1 },
    // Finished cycles, oldest first — what each run was aiming for and reached.
    // Capped when appended so a decade of monthly cycles can't bloat the doc.
    cycles: {
      type: [
        {
          _id: false,
          index: { type: Number, required: true },
          targetAmount: { type: Number, required: true },
          savedAmount: { type: Number, required: true },
          closedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
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
