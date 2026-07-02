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

// ---- Holding growth (deposits: FD / RD / bonds …) ----

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** What the user knows about a growing holding. Any field may be absent. */
export interface HoldingGrowthInput {
  invested?: number | string | null; // amount put in (cost basis)
  maturityValue?: number | string | null; // expected payout at the end
  rate?: number | string | null; // annual % (effective)
  startDate?: string | Date | null;
  maturityDate?: string | Date | null;
}

/** Derived figures for a holding — every field is null when it can't be computed. */
export interface HoldingGrowth {
  termYears: number | null; // start → maturity, in years
  elapsedYears: number | null; // start → asOf, clamped to [0, term]
  progressPct: number | null; // time elapsed, 0–100
  rate: number | null; // annual % — given, or derived from invested→maturity
  maturityValue: number | null; // given, or derived from invested + rate
  gain: number | null; // maturityValue − invested
  gainPct: number | null; // total return %, gain ÷ invested
  projectedNow: number | null; // invested compounded to asOf at `rate`
  rateDerived: boolean; // true when `rate` was computed from the maturity value
  maturityDerived: boolean; // true when `maturityValue` was computed from the rate
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asDate(d?: string | Date | null): Date | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Derive a deposit-style holding's return, maturity value and current worth.
 *
 * The model is a single effective-annual-compounding rate on a lump sum:
 *   maturity   = invested · (1 + r)^termYears
 *   rate (r)   = (maturity / invested)^(1/termYears) − 1
 *   worth(now) = invested · (1 + r)^elapsedYears
 *
 * It resolves whichever of {rate, maturityValue} is missing: a concrete maturity
 * value wins (and the rate is back-computed from it); otherwise the rate projects
 * the maturity value. For a Recurring Deposit (monthly deposits, not a lump sum)
 * this is a close approximation, not the bank's exact figure.
 *
 * `asOf` is passed in (never read from the clock here) so the result is pure.
 */
export function holdingGrowth(input: HoldingGrowthInput, asOf: Date): HoldingGrowth {
  const invested = num(input.invested);
  const start = asDate(input.startDate);
  const maturity = asDate(input.maturityDate);

  const termYears =
    start && maturity && maturity.getTime() > start.getTime()
      ? (maturity.getTime() - start.getTime()) / YEAR_MS
      : null;

  let rate = num(input.rate);
  let maturityValue = num(input.maturityValue);
  let rateDerived = false;
  let maturityDerived = false;

  if (invested != null && invested > 0 && termYears) {
    if (maturityValue != null && maturityValue > 0) {
      // Concrete cash figure wins — back out the effective annual rate from it.
      rate = (Math.pow(maturityValue / invested, 1 / termYears) - 1) * 100;
      rateDerived = true;
    } else if (rate != null) {
      maturityValue = invested * Math.pow(1 + rate / 100, termYears);
      maturityDerived = true;
    }
  }

  // Gain works from invested + maturity value even without dates.
  const gain = invested != null && maturityValue != null ? maturityValue - invested : null;
  const gainPct = invested != null && invested > 0 && gain != null ? (gain / invested) * 100 : null;

  let elapsedYears: number | null = null;
  let progressPct: number | null = null;
  if (start && termYears) {
    const raw = (asOf.getTime() - start.getTime()) / YEAR_MS;
    elapsedYears = Math.min(Math.max(raw, 0), termYears);
    progressPct = (elapsedYears / termYears) * 100;
  }

  const projectedNow =
    invested != null && invested >= 0 && rate != null && elapsedYears != null
      ? invested * Math.pow(1 + rate / 100, elapsedYears)
      : null;

  return {
    termYears,
    elapsedYears,
    progressPct,
    rate,
    maturityValue,
    gain,
    gainPct,
    projectedNow,
    rateDerived,
    maturityDerived,
  };
}
