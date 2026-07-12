import { Loan } from "../models/Loan";

/** This period's interest on a balance at an annual rate (reducing-balance). */
export function monthlyInterest(outstanding: number, roiPct: number): number {
  return outstanding * (roiPct / 12 / 100);
}

/**
 * Prepayment/foreclosure fee: `base` (prepaid or outstanding amount) × `chargePct`,
 * rounded to the rupee. Single source of truth for part-payment and preclosure so
 * the recorded charge stays consistent (mirrors the client's `prepaymentCharge`).
 */
export function prepaymentCharge(base: number, chargePct: number): number {
  return Math.round(Math.max(0, base) * (Math.max(0, chargePct) / 100));
}

/** Split a payment into { principal, interest } given the current balance and rate. */
export function splitPayment(
  outstanding: number,
  roiPct: number,
  amount: number
): { principal: number; interest: number } {
  const interestDue = monthlyInterest(outstanding, roiPct);
  const interest = Math.min(interestDue, amount); // a small payment may be all interest
  const principal = Math.max(0, Math.min(outstanding, amount - interestDue));
  return { principal, interest };
}

/**
 * Apply a loan EMI/payment of `amount`. Only the PRINCIPAL portion reduces the
 * outstanding (amortization-accurate); the INTEREST portion is accumulated into the
 * loan's lifetime `interestPaid`. Returns both parts so the linked transaction can
 * store them for exact reversal.
 */
export async function applyLoanPayment(
  loanId: unknown,
  userId: unknown,
  amount: number
): Promise<{ principal: number; interest: number }> {
  if (!loanId || !amount || amount <= 0) return { principal: 0, interest: 0 };
  const loan = await Loan.findOne({ _id: loanId, user: userId });
  if (!loan) return { principal: 0, interest: 0 };

  const { principal, interest } = splitPayment(loan.outstanding, loan.roi, amount);
  if (principal <= 0 && interest <= 0) return { principal: 0, interest: 0 };

  loan.outstanding = Math.max(0, loan.outstanding - principal);
  loan.interestPaid = (loan.interestPaid ?? 0) + interest;
  loan.status = loan.outstanding <= 0 ? "closed" : "active";
  await loan.save();
  return { principal, interest };
}

/** Reverse a previously-applied payment: add the principal back, undo the interest. */
export async function reverseLoanPayment(
  loanId: unknown,
  userId: unknown,
  principal: number,
  interest: number
): Promise<void> {
  if (!loanId || (!principal && !interest)) return;
  const loan = await Loan.findOne({ _id: loanId, user: userId });
  if (!loan) return;
  loan.outstanding = Math.max(0, loan.outstanding + (principal || 0));
  loan.interestPaid = Math.max(0, (loan.interestPaid ?? 0) - (interest || 0));
  loan.status = loan.outstanding <= 0 ? "closed" : "active";
  await loan.save();
}
