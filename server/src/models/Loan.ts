import { Schema, model, type InferSchemaType } from "mongoose";

export const LOAN_TYPES = ["home", "personal", "car", "education", "gold", "business", "other"] as const;
export const LOAN_STATUS = ["active", "closed"] as const;

/** A liability the user is repaying. Payoff projections are computed client-side
 *  from outstanding + roi + emi (see lib/networth.ts). */
const loanSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    lender: { type: String, default: "", trim: true }, // loan provider
    type: { type: String, enum: LOAN_TYPES, default: "personal" },
    principal: { type: Number, default: 0, min: 0 }, // original sanctioned amount
    outstanding: { type: Number, required: true, min: 0 },
    roi: { type: Number, default: 0, min: 0 }, // annual interest rate (%)
    emi: { type: Number, default: 0, min: 0 }, // monthly repayment amount
    foreclosureChargePct: { type: Number, default: 0, min: 0 }, // % penalty on preclosure
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: { type: String, enum: LOAN_STATUS, default: "active" },
    note: { type: String, default: "" },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

export type LoanDoc = InferSchemaType<typeof loanSchema>;
export const Loan = model("Loan", loanSchema);
