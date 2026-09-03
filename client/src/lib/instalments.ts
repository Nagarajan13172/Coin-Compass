import type { Frequency } from "@/lib/types";

/**
 * How often an instalment repeats, as people actually say it.
 *
 * The underlying rule stores a frequency and an interval, which lets it express
 * "every 3 months" — but nobody thinks in those two numbers. They think
 * "quarterly". One control, mapped here, so the form can't offer a combination
 * that reads as nonsense.
 */
export const CADENCES = [
  { key: "week", frequency: "weekly", interval: 1 },
  { key: "month", frequency: "monthly", interval: 1 },
  { key: "quarter", frequency: "monthly", interval: 3 },
  { key: "halfYear", frequency: "monthly", interval: 6 },
  { key: "year", frequency: "yearly", interval: 1 },
] as const;

export type CadenceKey = (typeof CADENCES)[number]["key"];

export function cadenceToRule(key: CadenceKey): { frequency: Frequency; interval: number } {
  const found = CADENCES.find((c) => c.key === key) ?? CADENCES[1];
  return { frequency: found.frequency as Frequency, interval: found.interval };
}

/** The rule's (frequency, interval) back to a cadence — monthly if it's an odd one. */
export function ruleToCadence(frequency?: string, interval?: number): CadenceKey {
  const found = CADENCES.find((c) => c.frequency === frequency && c.interval === (interval ?? 1));
  return found?.key ?? "month";
}
