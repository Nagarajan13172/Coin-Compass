/**
 * Parser for AMFI's daily NAV file (portal.amfiindia.com/spages/NAVAll.txt) —
 * the free, no-key feed every Indian fund's NAV comes from. Pure text in,
 * records out, so the format's quirks are unit-testable without the network
 * (same split as planMetalGapFill and the portfolio arithmetic).
 *
 * The file is a flat listing with structure carried by bare lines rather than
 * columns: a category heading, then an AMC name, then that AMC's schemes in
 * that category, and around again. Both have to be tracked as state while
 * walking the lines, because a scheme row names neither.
 *
 *   Open Ended Schemes(Equity Scheme - Flexi Cap Fund)
 *   PPFAS Mutual Fund
 *   122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;83.5;31-Aug-2026
 */

/** Broad class, derived from the category heading. Drives tax treatment later. */
export const FUND_KINDS = ["equity", "debt", "hybrid", "solution", "other"] as const;
export type FundKind = (typeof FUND_KINDS)[number];

export interface ParsedFund {
  schemeCode: string;
  isin: string;
  name: string;
  /** "Direct" / "Regular" / "" when the file doesn't separate it out. */
  plan: string;
  /** "Growth" / "IDCW" / "" — payout variants collapse to IDCW. */
  option: string;
  fundHouse: string;
  category: string;
  kind: FundKind;
  nav: number;
  navDate: Date;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "31-Aug-2026" → a local midnight Date, or null if it isn't that shape. */
export function parseNavDate(raw: string): Date | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Number(m[3]), month, Number(m[1]));
}

/** Which broad class a category heading describes. */
export function kindFromCategory(category: string): FundKind {
  const c = category.toLowerCase();
  if (c.includes("equity scheme")) return "equity";
  if (c.includes("debt scheme") || c.includes("money market") || c.includes("liquid")) return "debt";
  if (c.includes("hybrid scheme")) return "hybrid";
  // AMFI files these under either "Solution Oriented" or their own heading.
  if (c.includes("solution oriented") || c.includes("children") || c.includes("retirement")) return "solution";
  // Index funds, ETFs, FoFs and anything new land here. Note for the tax work:
  // "other" is NOT the same as "not equity" — an index fund tracking Nifty is
  // taxed as equity. Read the category text before trusting this for tax.
  return "other";
}

/**
 * Normalise the option column. AMFI writes several spellings of the same thing —
 * "Dividend Payout", "IDCW Reinvestment", "Growth Option" — and the distinction
 * that matters to a holder is only growth vs payout.
 */
export function normaliseOption(raw: string): string {
  const o = raw.toLowerCase();
  if (o.includes("growth")) return "Growth";
  if (o.includes("idcw") || o.includes("dividend")) return "IDCW";
  return raw.trim();
}

/** "Direct Plan" → "Direct"; "Regular Plan" → "Regular"; anything else verbatim. */
export function normalisePlan(raw: string): string {
  const p = raw.toLowerCase();
  if (p.includes("direct")) return "Direct";
  if (p.includes("regular")) return "Regular";
  return raw.trim();
}

/**
 * Split a scheme name that carries its own plan/option, for the older 6-column
 * form of the file where they aren't separate columns:
 * "Axis Bluechip Fund - Direct Plan - Growth Option".
 */
function planOptionFromName(name: string): { plan: string; option: string } {
  return {
    plan: /\bdirect\b/i.test(name) ? "Direct" : /\bregular\b/i.test(name) ? "Regular" : "",
    option: /\bgrowth\b/i.test(name) ? "Growth" : /idcw|dividend/i.test(name) ? "IDCW" : "",
  };
}

/**
 * Parse the whole file. Rows without a usable NAV (a new scheme shows "N.A.")
 * are skipped rather than stored as zero — a fund valued at ₹0 would quietly
 * wipe someone's portfolio.
 */
export function parseNavAll(text: string): ParsedFund[] {
  const out: ParsedFund[] = [];
  let category = "";
  let fundHouse = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!line.includes(";")) {
      // A heading: either a category ("Open Ended Schemes(...)") or an AMC name.
      // Categories always name a scheme type; everything else is a fund house.
      if (/schemes?\s*\(/i.test(line)) {
        category = line;
        fundHouse = ""; // the AMC line always follows its category
      } else {
        fundHouse = line;
      }
      continue;
    }

    const cols = line.split(";").map((c) => c.trim());
    if (cols[0] === "Scheme Code") continue; // header row

    // 8 columns since AMFI split plan/option out; 6 in the older layout.
    const eight = cols.length >= 8;
    const schemeCode = cols[0];
    const name = eight ? cols[3] : cols[3];
    const navRaw = eight ? cols[6] : cols[4];
    const dateRaw = eight ? cols[7] : cols[5];
    if (!/^\d+$/.test(schemeCode) || !name) continue;

    const nav = Number(navRaw);
    const navDate = parseNavDate(dateRaw ?? "");
    if (!Number.isFinite(nav) || nav <= 0 || !navDate) continue;

    const fallback = planOptionFromName(name);
    out.push({
      schemeCode,
      // Growth ISIN first; "-" means the scheme has none of that variant.
      isin: cols[1] && cols[1] !== "-" ? cols[1] : cols[2] && cols[2] !== "-" ? cols[2] : "",
      name,
      plan: eight && cols[4] ? normalisePlan(cols[4]) : fallback.plan,
      option: eight && cols[5] ? normaliseOption(cols[5]) : fallback.option,
      fundHouse,
      category,
      kind: kindFromCategory(category),
      nav,
      navDate,
    });
  }

  return out;
}
