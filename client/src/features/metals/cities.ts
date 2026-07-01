export interface GoldCity {
  key: string;
  label: string;
  /** Approx retail premium over international spot (import duty + GST + local margin), in %. */
  premiumPct: number;
}

/**
 * Indian counter rates add import duty (~6%) + GST (3%) + local dealer margin on
 * top of the international spot price that GoldAPI returns. These premiums
 * approximate the METAL portion of a city's 22K retail rate (making charges are
 * NOT included) and are indicative + tunable — they are not live per-city quotes.
 * Chennai is the default/high-priority city. Calibrate any value to match a real
 * local counter rate: premium% = (localRate / spotRate − 1) × 100.
 */
export const GOLD_CITIES: GoldCity[] = [
  { key: "chennai", label: "Chennai", premiumPct: 12.5 },
  { key: "coimbatore", label: "Coimbatore", premiumPct: 12.5 },
  { key: "madurai", label: "Madurai", premiumPct: 12.5 },
  { key: "bengaluru", label: "Bengaluru", premiumPct: 12 },
  { key: "hyderabad", label: "Hyderabad", premiumPct: 12 },
  { key: "mumbai", label: "Mumbai", premiumPct: 11.5 },
  { key: "delhi", label: "Delhi", premiumPct: 11.5 },
  { key: "kolkata", label: "Kolkata", premiumPct: 11.5 },
];

export const DEFAULT_CITY = "chennai";

export function findCity(key: string): GoldCity {
  return GOLD_CITIES.find((c) => c.key === key) ?? GOLD_CITIES[0];
}

/** Approximate local rate for a spot value: spot × (1 + premium%). */
export function localRate(spotValue: number, premiumPct: number): number {
  return spotValue * (1 + premiumPct / 100);
}
