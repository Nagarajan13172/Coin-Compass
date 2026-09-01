import { Fund, type FundDoc } from "../models/Fund";
import { env } from "../config/env";
import { parseNavAll, type ParsedFund } from "./navParse";

/**
 * Keeps the local scheme cache in step with AMFI's daily NAV file, and answers
 * fund searches out of that cache.
 *
 * Every read goes through the NavProvider seam for the same reason stock prices
 * do: the upstream is a free public file with no SLA, so if it moves or changes
 * shape, one function changes. "stub" prices a handful of fixed schemes with no
 * network at all, which is how the test suite exercises buying and redeeming
 * deterministically (mirrors STOCKS_PROVIDER=stub and METALS_ENABLED=false).
 */

export interface NavProvider {
  /** Every scheme AMFI published today, already parsed. */
  fetchAll(): Promise<ParsedFund[]>;
}

const amfiProvider: NavProvider = {
  async fetchAll() {
    const res = await fetch(env.funds.navUrl, {
      redirect: "follow",
      headers: { "User-Agent": "CoinCompass/1.0 (personal finance manager)" },
    });
    if (!res.ok) throw new Error(`AMFI NAV fetch failed: ${res.status}`);
    return parseNavAll(await res.text());
  },
};

/** A few real schemes at fixed NAVs — enough to exercise every code path offline. */
const STUB_FUNDS: ParsedFund[] = [
  {
    schemeCode: "122639",
    isin: "INF879O01027",
    name: "Parag Parikh Flexi Cap Fund",
    plan: "Direct",
    option: "Growth",
    fundHouse: "PPFAS Mutual Fund",
    category: "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)",
    kind: "equity",
    nav: 100,
    navDate: new Date(),
  },
  {
    schemeCode: "119063",
    isin: "INF179K01YV8",
    name: "HDFC Liquid Fund",
    plan: "Regular",
    option: "Growth",
    fundHouse: "HDFC Mutual Fund",
    category: "Open Ended Schemes(Debt Scheme - Liquid Fund)",
    kind: "debt",
    nav: 50,
    navDate: new Date(),
  },
];

const stubProvider: NavProvider = {
  async fetchAll() {
    return STUB_FUNDS.map((f) => ({ ...f, navDate: new Date() }));
  },
};

export function navProvider(): NavProvider {
  return env.funds.provider === "stub" ? stubProvider : amfiProvider;
}

/**
 * Pull the day's file and upsert every scheme. One bulk write per chunk keeps a
 * 14,000-row refresh to a handful of round trips. Returns how many were stored.
 */
export async function refreshFundUniverse(): Promise<number> {
  const funds = await navProvider().fetchAll();
  if (!funds.length) return 0;

  const now = new Date();
  const CHUNK = 1000;
  for (let i = 0; i < funds.length; i += CHUNK) {
    await Fund.bulkWrite(
      funds.slice(i, i + CHUNK).map((f) => ({
        updateOne: {
          filter: { schemeCode: f.schemeCode },
          update: {
            $set: {
              isin: f.isin,
              name: f.name,
              fundHouse: f.fundHouse,
              plan: f.plan,
              option: f.option,
              category: f.category,
              kind: f.kind,
              nav: f.nav,
              navDate: f.navDate,
              lastSeenAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
  return funds.length;
}

/** How old the cache is, in hours — Infinity when nothing has been stored yet. */
async function cacheAgeHours(): Promise<number> {
  const newest = await Fund.findOne().sort({ lastSeenAt: -1 }).select("lastSeenAt").lean();
  if (!newest?.lastSeenAt) return Infinity;
  return (Date.now() - new Date(newest.lastSeenAt).getTime()) / 3_600_000;
}

/**
 * Refresh only if the cache is missing or older than `maxAgeHours`. Called on
 * boot and before a search, so a fresh install can find a fund immediately
 * without waiting for the nightly job.
 */
export async function ensureFundUniverse(maxAgeHours = 24): Promise<void> {
  if ((await cacheAgeHours()) <= maxAgeHours) return;
  await refreshFundUniverse();
}

export interface FundSearchHit {
  schemeCode: string;
  name: string;
  fundHouse: string;
  plan: string;
  option: string;
  category: string;
  kind: string;
  nav: number;
  navDate: Date | null;
}

const toHit = (f: FundDoc): FundSearchHit => ({
  schemeCode: f.schemeCode,
  name: f.name,
  fundHouse: f.fundHouse ?? "",
  plan: f.plan ?? "",
  option: f.option ?? "",
  category: f.category ?? "",
  kind: f.kind ?? "other",
  nav: f.nav ?? 0,
  navDate: f.navDate ?? null,
});

/**
 * Search the cached universe. Growth plans come first: a fund's Growth and IDCW
 * variants have the same name, and Growth is what all-but-a-few investors hold,
 * so it shouldn't be buried under a dozen payout frequencies.
 */
export async function searchFunds(query: string, limit = 20): Promise<FundSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  await ensureFundUniverse();

  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const hits = await Fund.find({ $or: [{ name: rx }, { fundHouse: rx }, { schemeCode: q }] })
    .limit(limit * 4)
    .lean();

  return hits
    .sort((a, b) => {
      const rank = (f: (typeof hits)[number]) =>
        (f.option === "Growth" ? 0 : 2) + (f.plan === "Direct" ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map(toHit);
}

/** One scheme by AMFI code, refreshing the cache first if it isn't known yet. */
export async function getFundByCode(schemeCode: string) {
  const found = await Fund.findOne({ schemeCode });
  if (found) return found;
  await ensureFundUniverse(0);
  return Fund.findOne({ schemeCode });
}

/** Latest NAV per scheme code, for valuing a set of holdings in one query. */
export async function getNavs(schemeCodes: string[]): Promise<Map<string, { nav: number; navDate: Date | null }>> {
  if (!schemeCodes.length) return new Map();
  const funds = await Fund.find({ schemeCode: { $in: schemeCodes } })
    .select("schemeCode nav navDate")
    .lean();
  return new Map(funds.map((f) => [f.schemeCode, { nav: f.nav ?? 0, navDate: f.navDate ?? null }]));
}
