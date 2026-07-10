import type { Metal, MetalPrice } from "@/lib/types";

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
 * Chennai is the default/high-priority city.
 *
 * This premium is only a FALLBACK — Chennai normally shows GRT's actual scraped
 * rate. Calibrated to GRT (grtjewels.com) on 01-Jul-2026: 22K ₹12,905/g vs
 * GoldAPI spot 22K ₹11,203.90 → +15.2%. Recalibrate if it drifts:
 *   premium% = (localRate / spotRate − 1) × 100.
 */
export const GOLD_CITIES: GoldCity[] = [
  { key: "chennai", label: "Chennai", premiumPct: 15.2 },
  { key: "coimbatore", label: "Coimbatore", premiumPct: 15.2 },
  { key: "madurai", label: "Madurai", premiumPct: 15.2 },
  { key: "bengaluru", label: "Bengaluru", premiumPct: 15 },
  { key: "hyderabad", label: "Hyderabad", premiumPct: 15 },
  { key: "mumbai", label: "Mumbai", premiumPct: 14.5 },
  { key: "delhi", label: "Delhi", premiumPct: 14.5 },
  { key: "kolkata", label: "Kolkata", premiumPct: 14.5 },
];

export const DEFAULT_CITY = "chennai";

export function findCity(key: string): GoldCity {
  return GOLD_CITIES.find((c) => c.key === key) ?? GOLD_CITIES[0];
}

/** Approximate local rate for a spot value: spot × (1 + premium%). */
export function localRate(spotValue: number, premiumPct: number): number {
  return spotValue * (1 + premiumPct / 100);
}

export interface ResolvedCityRate {
  gram22k: number;
  gram24k: number;
  gram18k: number;
  source: string;
  /** true = estimated from spot + premium; false = actual GRT counter rate. */
  approx: boolean;
}

/**
 * Resolve a city's 22K/24K/18K rate. Chennai prefers GRT's actual scraped
 * counter rate when available; every other case (scrape missing, or another
 * city) falls back to the international spot price plus the city's premium.
 */
export function resolveCityRate(price: MetalPrice, city: GoldCity): ResolvedCityRate {
  if (city.key === "chennai" && (price.retail22k ?? 0) > 0) {
    return {
      gram22k: price.retail22k as number,
      gram24k: price.retail24k || localRate(price.pricePerGram24k, city.premiumPct),
      gram18k: price.retail18k || localRate(price.pricePerGram18k, city.premiumPct),
      source: price.retailSource || "GRT · Chennai",
      approx: false,
    };
  }
  return {
    gram22k: localRate(price.pricePerGram22k, city.premiumPct),
    gram24k: localRate(price.pricePerGram24k, city.premiumPct),
    gram18k: localRate(price.pricePerGram18k, city.premiumPct),
    source: `≈ spot +${city.premiumPct}%`,
    approx: true,
  };
}

/** One plotted point: the date plus the rate the chart should draw. */
export interface MetalSeriesPoint {
  date: string;
  value: number;
  /** true when `value` is estimated from spot + premium rather than a real counter rate. */
  approx: boolean;
}

/**
 * The series a metal chart should plot. Gold follows the SAME rule as the headline
 * card — the city's 22K counter rate, i.e. GRT's actual scraped rate on the days we
 * captured it, otherwise spot + the city premium. Silver plots its .999 per-gram
 * rate. Plotting the raw spot rate here would contradict the headline figure.
 */
export function metalChartSeries(
  data: MetalPrice[],
  metal: Metal,
  city?: GoldCity
): MetalSeriesPoint[] {
  return data.map((p) => {
    if (metal !== "gold") return { date: p.date, value: p.pricePerGram24k, approx: false };
    if (!city) return { date: p.date, value: p.pricePerGram22k, approx: true };
    const rate = resolveCityRate(p, city);
    return { date: p.date, value: rate.gram22k, approx: rate.approx };
  });
}
