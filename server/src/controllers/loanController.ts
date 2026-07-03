import type { Request, Response } from "express";
import { Loan } from "../models/Loan";
import { Transaction } from "../models/Transaction";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { loanSchema, loanUpdateSchema, loanPaySchema, loanPrecloseSchema } from "../validators/schemas";
import { prepaymentCharge } from "../services/loanService";
import { addMonths } from "../utils/dateRange";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/** End date = start + tenure when both are known; otherwise fall back to any
 *  explicit endDate. Keeps the projected payoff date in step with the tenure. */
function deriveEndDate(input: {
  startDate?: Date | null;
  tenureMonths?: number | null;
  endDate?: Date | null;
}): Date | null {
  if (input.startDate && input.tenureMonths && input.tenureMonths > 0) {
    return addMonths(new Date(input.startDate), input.tenureMonths);
  }
  return input.endDate ?? null;
}

export async function listLoans(req: Request, res: Response) {
  const uid = userId(req);
  const loans = await Loan.find({ user: uid }).sort({ status: 1, outstanding: -1 }).lean();
  res.json(loans);
}

export async function createLoan(req: Request, res: Response) {
  const uid = userId(req);
  const data = loanSchema.parse(req.body);
  const endDate = deriveEndDate(data);
  const loan = await Loan.create({ ...data, endDate, user: uid });
  res.status(201).json(loan.toObject());
}

export async function updateLoan(req: Request, res: Response) {
  const uid = userId(req);
  const data = loanUpdateSchema.parse(req.body);
  const loan = await Loan.findOne({ _id: req.params.id, user: uid });
  if (!loan) throw new HttpError(404, "Loan not found");

  Object.assign(loan, data);
  // Re-derive the end date whenever the start date or tenure could have changed.
  if ("startDate" in data || "tenureMonths" in data || "endDate" in data) {
    loan.endDate = deriveEndDate({ startDate: loan.startDate, tenureMonths: loan.tenureMonths, endDate: loan.endDate });
  }
  await loan.save();
  res.json(loan.toObject());
}

/**
 * Record a part payment (prepayment): the full amount goes to principal (a lump-sum
 * prepayment carries no interest), plus an optional prepayment charge % on the amount
 * that's tracked in the loan's lifetime `chargesPaid`. Auto-closes when it hits 0.
 */
export async function payLoan(req: Request, res: Response) {
  const uid = userId(req);
  const { amount, chargePct = 0 } = loanPaySchema.parse(req.body);
  const loan = await Loan.findOne({ _id: req.params.id, user: uid });
  if (!loan) throw new HttpError(404, "Loan not found");
  const principal = Math.min(amount, loan.outstanding);
  loan.outstanding = Math.max(0, loan.outstanding - amount);
  loan.chargesPaid = (loan.chargesPaid ?? 0) + prepaymentCharge(principal, chargePct);
  if (loan.outstanding === 0) loan.status = "closed";
  await loan.save();
  res.json(loan.toObject());
}

/** Preclose (foreclose) the loan: record the charge, zero the balance, mark closed. */
export async function precloseLoan(req: Request, res: Response) {
  const uid = userId(req);
  const { chargePct } = loanPrecloseSchema.parse(req.body);
  const loan = await Loan.findOne({ _id: req.params.id, user: uid });
  if (!loan) throw new HttpError(404, "Loan not found");
  loan.foreclosureChargePct = chargePct;
  loan.chargesPaid = (loan.chargesPaid ?? 0) + prepaymentCharge(loan.outstanding, chargePct);
  loan.outstanding = 0;
  loan.status = "closed";
  await loan.save();
  res.json(loan.toObject());
}

export async function deleteLoan(req: Request, res: Response) {
  const uid = userId(req);
  const loan = await Loan.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!loan) throw new HttpError(404, "Loan not found");
  // Cascade the unlink so nothing keeps pointing at (or posting to) a deleted loan:
  // past transactions drop their dangling loan ref, and any recurring EMI rule is
  // detached so it stops trying to reduce a loan that no longer exists.
  await Transaction.updateMany(
    { user: uid, loan: loan._id },
    { $set: { loan: null, loanPrincipal: 0, loanInterest: 0 } }
  );
  await RecurringTransaction.updateMany({ user: uid, loan: loan._id }, { $set: { loan: null } });
  res.json({ ok: true });
}
