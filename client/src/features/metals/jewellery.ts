/**
 * What a piece of jewellery actually costs at today's rate.
 *
 * A counter rate is only the start of the bill. The jeweller adds making charges
 * — a percentage of the metal's value that varies with the piece, roughly 8-15%
 * for a plain bangle or chain and 20-25% for an intricate ring — and then 3% GST
 * on the whole lot. Two pieces of the same weight can differ by thousands
 * because of that percentage, which is why it's an input here and not a constant.
 *
 * Pure functions, so the arithmetic is testable without a rate feed.
 */

/** GST on gold jewellery in India: 3% of metal value plus making charges. */
export const GST_PCT = 3;

/** One sovereign (பவுன் / pavan) is 8 grams — how gold is bought in Tamil Nadu. */
export const GRAMS_PER_SOVEREIGN = 8;

/** Making charges people meet most often, as a starting point they can edit. */
export const MAKING_PRESETS = [
  { key: "chain", pct: 8 },
  { key: "bangle", pct: 12 },
  { key: "necklace", pct: 15 },
  { key: "ring", pct: 20 },
] as const;

export interface JewelleryCost {
  grams: number;
  /** rate × grams, before anything is added. */
  metalValue: number;
  makingCharges: number;
  /** Charged on metal + making, never on metal alone. */
  gst: number;
  total: number;
  /** What a gram ends up costing once everything is on — the comparable number. */
  perGram: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Break a purchase into its parts. Negative inputs are treated as zero rather
 * than producing a negative bill — a rate that hasn't loaded yet shouldn't read
 * as the jeweller paying you.
 */
export function jewelleryCost(
  ratePerGram: number,
  grams: number,
  makingPct: number,
  gstPct: number = GST_PCT
): JewelleryCost {
  const rate = Math.max(0, ratePerGram);
  const weight = Math.max(0, grams);
  const making = Math.max(0, makingPct);
  const gstRate = Math.max(0, gstPct);

  const metalValue = round2(rate * weight);
  const makingCharges = round2((metalValue * making) / 100);
  const gst = round2(((metalValue + makingCharges) * gstRate) / 100);
  const total = round2(metalValue + makingCharges + gst);

  return {
    grams: weight,
    metalValue,
    makingCharges,
    gst,
    total,
    perGram: weight > 0 ? round2(total / weight) : 0,
  };
}

/** Grams → sovereigns, for labelling a row as "2 sovereigns". */
export function toSovereigns(grams: number): number {
  return round2(grams / GRAMS_PER_SOVEREIGN);
}

/**
 * The weights a table should show: the everyday ones for that metal, plus
 * whatever the user typed, without repeating a weight already listed.
 *
 * The two metals are bought in different units and it isn't a detail. Gold goes
 * by the gram and the sovereign — 8, 16, 24 grams. Nobody buys 8 grams of
 * silver; it's sold by the 100 grams and the kilo, so showing gold's ladder for
 * silver produces a table of amounts no one would ever ask for.
 */
export function weightRows(custom: number, metal: "gold" | "silver" = "gold"): number[] {
  const rows = metal === "silver" ? [10, 50, 100, 250, 500, 1000] : [1, 8, 16, 24, 40];
  const extra = round2(custom);
  if (extra > 0 && !rows.includes(extra)) rows.push(extra);
  return rows.sort((a, b) => a - b);
}
