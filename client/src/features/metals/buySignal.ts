/**
 * Is today a good day to buy?
 *
 * There's no forecast here and there shouldn't be — nobody can tell you where
 * gold goes next. What can be said honestly is where today sits against its own
 * recent history: a rate below its 30-day average is cheap *by recent standards*,
 * and one above it is dear. That's the whole claim, and the wording throughout
 * keeps it that size.
 *
 * Pure functions, so the arithmetic is testable without a rate feed.
 */

/**
 * How far from the average still counts as "about normal". Gold moves a percent
 * or so on an ordinary day, so without a dead band the verdict would flip green
 * to red on noise and mean nothing.
 */
export const NEUTRAL_BAND_PCT = 0.5;

export type BuyVerdict = "good" | "fair" | "high";

/** The mean of the last `days` points, or of everything when there are fewer. */
export function movingAverage(values: number[], days: number): number {
  const window = values.slice(-Math.max(1, days)).filter((v) => Number.isFinite(v) && v > 0);
  if (!window.length) return 0;
  const sum = window.reduce((s, v) => s + v, 0);
  return Math.round((sum / window.length) * 100) / 100;
}

export interface BuySignal {
  average: number;
  /** Today minus the average, in rupees per gram. */
  diff: number;
  /** The same as a percentage of the average — what the verdict reads. */
  diffPct: number;
  verdict: BuyVerdict;
  /** Below this, buying is cheap by recent standards. */
  goodBelow: number;
  /** Above this, it's dear by the same measure. */
  highAbove: number;
}

/**
 * Place today's rate against an average. A zero or missing average yields a
 * "fair" verdict with zeroed bounds rather than a division by zero — a page with
 * no history yet should say nothing, not shout.
 */
export function buySignal(
  current: number,
  average: number,
  bandPct: number = NEUTRAL_BAND_PCT
): BuySignal {
  if (!average || average <= 0 || !current || current <= 0) {
    return { average: 0, diff: 0, diffPct: 0, verdict: "fair", goodBelow: 0, highAbove: 0 };
  }
  const band = Math.max(0, bandPct);
  const goodBelow = Math.round(average * (1 - band / 100) * 100) / 100;
  const highAbove = Math.round(average * (1 + band / 100) * 100) / 100;
  const diff = Math.round((current - average) * 100) / 100;
  const diffPct = Math.round((diff / average) * 100 * 100) / 100;

  return {
    average,
    diff,
    diffPct,
    verdict: current < goodBelow ? "good" : current > highAbove ? "high" : "fair",
    goodBelow,
    highAbove,
  };
}

/** The three windows worth comparing, shortest first. */
export const AVERAGE_WINDOWS = [7, 30, 90] as const;

/** Each window's average, for the row that lets you compare them at a glance. */
export function averagesFor(values: number[]): { days: number; average: number }[] {
  return AVERAGE_WINDOWS.map((days) => ({ days, average: movingAverage(values, days) }));
}
