import type { HoldingClass, HoldingSubtype, LoanType } from "@/lib/types";

export interface SubtypeMeta {
  value: HoldingSubtype;
  label: string;
  color: string;
  icon: string;
  class: HoldingClass;
}

/** Saving subtypes (Deposits + funds). Physical deposits live here. */
export const SAVING_SUBTYPES: SubtypeMeta[] = [
  { value: "fixed_deposit", label: "Fixed Deposit", color: "#0EA5E9", icon: "landmark", class: "saving" },
  { value: "recurring_deposit", label: "Recurring Deposit", color: "#14B8A6", icon: "repeat", class: "saving" },
  { value: "emergency_fund", label: "Emergency Fund", color: "#F59E0B", icon: "shield", class: "saving" },
  { value: "retirement_fund", label: "Retirement Fund", color: "#8B5CF6", icon: "umbrella", class: "saving" },
];

/** Investment subtypes. Physical assets map here: jewellery → Gold, house → Real Estate. */
export const INVESTMENT_SUBTYPES: SubtypeMeta[] = [
  { value: "stocks", label: "Stocks", color: "#EF4444", icon: "trending-up", class: "investment" },
  { value: "mutual_funds", label: "Mutual Funds", color: "#6366F1", icon: "coins", class: "investment" },
  { value: "real_estate", label: "Real Estate", color: "#10B981", icon: "building", class: "investment" },
  { value: "bonds", label: "Bonds", color: "#F97316", icon: "file-text", class: "investment" },
  { value: "gold", label: "Gold", color: "#EAB308", icon: "gem", class: "investment" },
];

export const ALL_SUBTYPES = [...SAVING_SUBTYPES, ...INVESTMENT_SUBTYPES];

export const SUBTYPE_META: Record<HoldingSubtype, SubtypeMeta> = Object.fromEntries(
  ALL_SUBTYPES.map((s) => [s.value, s])
) as Record<HoldingSubtype, SubtypeMeta>;

export const CLASS_META: Record<HoldingClass, { label: string; color: string; icon: string }> = {
  saving: { label: "Saving", color: "#10B981", icon: "piggy-bank" },
  investment: { label: "Investment", color: "#6366F1", icon: "trending-up" },
};

/** Distinct slice colors for per-item charts (e.g. outstanding by loan). */
export const CHART_PALETTE = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#EAB308",
  "#8B5CF6",
  "#6366F1",
  "#0EA5E9",
  "#14B8A6",
  "#10B981",
];

/**
 * Per-type loan metadata. `typicalChargePct` seeds the prepayment/foreclosure
 * charge for a new loan of that type — a sensible, editable default, not a rule.
 * Reflects Indian practice as of 2026: under the RBI (Pre-payment Charges on
 * Loans) Directions, 2025, floating-rate loans to individuals (home, personal &
 * education) carry no charge, so those default to 0; fixed-rate car, business &
 * gold loans still typically levy 1–5% of the prepaid amount (+ GST).
 */
export const LOAN_TYPE_META: Record<LoanType, { label: string; icon: string; typicalChargePct: number }> = {
  home: { label: "Home", icon: "house", typicalChargePct: 0 },
  personal: { label: "Personal", icon: "user", typicalChargePct: 0 },
  car: { label: "Car / Vehicle", icon: "car", typicalChargePct: 5 },
  education: { label: "Education", icon: "graduation-cap", typicalChargePct: 0 },
  gold: { label: "Gold", icon: "gem", typicalChargePct: 1 },
  business: { label: "Business", icon: "briefcase", typicalChargePct: 4 },
  other: { label: "Other", icon: "landmark", typicalChargePct: 2 },
};

// ---- Loan payoff (amortization) calculator ----

export interface PayoffResult {
  /** payment at least covers monthly interest (otherwise the balance never falls) */
  feasible: boolean;
  months: number; // Infinity if not feasible
  totalPaid: number;
  totalInterest: number;
}

/**
 * Months to clear `outstanding` at annual `roiPct` paying `monthly` each month.
 * Standard reducing-balance amortization: n = -ln(1 - P·i/M) / ln(1+i).
 */
export function computePayoff(outstanding: number, roiPct: number, monthly: number): PayoffResult {
  const P = Math.max(0, outstanding);
  if (P === 0) return { feasible: true, months: 0, totalPaid: 0, totalInterest: 0 };
  if (monthly <= 0) return { feasible: false, months: Infinity, totalPaid: Infinity, totalInterest: Infinity };

  const i = roiPct / 12 / 100;
  if (i <= 0) {
    const months = Math.ceil(P / monthly);
    return { feasible: true, months, totalPaid: P, totalInterest: 0 };
  }
  // Payment must exceed the first month's interest, else the loan never closes.
  if (monthly <= P * i) return { feasible: false, months: Infinity, totalPaid: Infinity, totalInterest: Infinity };

  const months = Math.ceil(-Math.log(1 - (P * i) / monthly) / Math.log(1 + i));
  const totalPaid = monthly * months; // last instalment is smaller — slight overestimate
  return { feasible: true, months, totalPaid, totalInterest: Math.max(0, totalPaid - P) };
}

/**
 * The prepayment/foreclosure fee a lender levies on an early payment:
 * `base` (the prepaid or outstanding amount) × `chargePct`, rounded to the rupee.
 * Single source of truth shared by the payoff planner, part-payment and preclose
 * flows so a change to the rounding or formula lands everywhere at once. GST, if
 * any, is charged on top by the lender and is not included here.
 */
export function prepaymentCharge(base: number, chargePct: number): number {
  return Math.round(Math.max(0, base) * (Math.max(0, chargePct) / 100));
}

/** "2 yr 4 mo" from a month count. */
export function formatMonths(months: number): string {
  if (!isFinite(months)) return "Never";
  if (months <= 0) return "Paid off";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : "", m ? `${m} mo` : ""].filter(Boolean).join(" ") || "0 mo";
}
