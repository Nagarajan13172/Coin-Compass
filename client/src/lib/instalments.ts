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

/**
 * The date the last instalment of a fixed term falls on.
 *
 * A 12-month RD starting in September pays in September and then eleven more
 * times, so the last one is eleven intervals out — not twelve. Mirrors
 * termEndDate on the server, which is what actually stops the schedule.
 */
export function lastInstalment(startDate: string, cadence: CadenceKey, termCount: number): Date {
  const { frequency, interval } = cadenceToRule(cadence);
  const d = new Date(startDate);
  const steps = Math.max(1, termCount) - 1;
  for (let i = 0; i < steps; i += 1) {
    if (frequency === "weekly") d.setDate(d.getDate() + 7 * interval);
    else if (frequency === "yearly") d.setFullYear(d.getFullYear() + interval);
    else if (frequency === "daily") d.setDate(d.getDate() + interval);
    else d.setMonth(d.getMonth() + interval);
  }
  return d;
}
