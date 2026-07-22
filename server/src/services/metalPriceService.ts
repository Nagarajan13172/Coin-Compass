import { env } from "../config/env";
import { MetalPrice, METALS, type Metal } from "../models/MetalPrice";
import { HttpError } from "../middleware/errorHandler";

/** Today's date as YYYY-MM-DD in IST, so "today" matches the Indian market day. */
function istDate(d = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * GRT Jewellers publishes no API, but their homepage embeds the current rates
 * as JSON in a `gold_rate` array (despite the name it holds every metal):
 *   {"type":"GOLD","unit":"G","purity":"22 KT","amount":13065}
 *   {"type":"SILVER","unit":"G","purity":null,"amount":235}
 * Reading that directly means our figures match exactly what shoppers see on
 * grtjewels.com — no third-party rate API involved.
 */
const GRT_URL = "https://www.grtjewels.com/";

/** Source marker stored on GRT snapshots; a mismatch triggers a re-scrape. */
const GRT_SOURCE = "GRT · grtjewels.com";

/** Source markers stamped on interpolated gap-fill snapshots (see fillMetalGaps). */
const GAP_SOURCE = "estimated · gap interpolation";
const GAP_GOLD_RETAIL_SOURCE = "Estimated · gap (interpolated)";

/**
 * Chennai retail carries roughly this premium over international spot (import
 * duty + GST + local dealer margin) — the same figure the client calibrates its
 * per-city rates with (see client/src/features/metals/cities.ts). GRT gives us
 * the actual Chennai retail rate; we back an implied spot out of it so the
 * per-city estimates and the "spot" reference lines still render a sensible
 * number for cities other than Chennai.
 */
const CHENNAI_RETAIL_PREMIUM_PCT = 15.2;
const GRAMS_PER_TROY_OZ = 31.1034768;

/** International spot per-gram implied by a GRT retail per-gram (0 stays 0). */
function impliedSpotPerGram(retail: number): number {
  if (!(retail > 0)) return 0;
  return Math.round((retail / (1 + CHENNAI_RETAIL_PREMIUM_PCT / 100)) * 100) / 100;
}

/** Per-gram INR rates parsed from GRT's homepage. 0 = that figure was absent. */
export interface GrtRates {
  gram22k: number;
  gram24k: number;
  gram18k: number;
  silverPerGram: number; // .999 silver retail, ₹/g
}

/**
 * Parse GRT's per-gram rates out of the raw homepage HTML. Best-effort: returns
 * null when gold's 22K rate can't be read or fails a sanity check (the caller
 * then leaves the existing snapshot untouched and retries next run). Pure and
 * network-free so it can be unit-tested against a saved page fixture.
 */
export function parseGrtRates(html: string): GrtRates | null {
  // The rate JSON sits inside a JS string, so its quotes are backslash-escaped;
  // unescape first, then read each metal's amount out of its typed object.
  const norm = html.replace(/\\"/g, '"');

  // Gold purities are tagged `"type":"GOLD" ... "purity":"22 KT"`; `[^}]*` never
  // crosses an object boundary (each item ends in `}`), so this stays within one.
  const pickGoldKt = (kt: number): number => {
    const m = norm.match(
      new RegExp(`"type":"GOLD"[^}]*"purity":"${kt}\\s*KT"[^}]*"amount":([0-9]+(?:\\.[0-9]+)?)`)
    );
    return m ? parseFloat(m[1]) : NaN;
  };
  // Non-gold metals (SILVER/PLATINUM) carry `"purity":null`, so match by type.
  const pickType = (type: string): number => {
    const m = norm.match(new RegExp(`"type":"${type}"[^}]*"amount":([0-9]+(?:\\.[0-9]+)?)`));
    return m ? parseFloat(m[1]) : NaN;
  };

  let gram22k = pickGoldKt(22);
  const gram24k = pickGoldKt(24);
  const gram18k = pickGoldKt(18);
  const silverPerGram = pickType("SILVER");

  // Fallback: read 22K from the header button if the JSON shape ever changes.
  if (isNaN(gram22k)) {
    const hm = norm.match(/GOLD\s*22\s*KT\/1g[^0-9]*([0-9,]+)/i);
    if (hm) gram22k = parseFloat(hm[1].replace(/,/g, ""));
  }

  // Sanity: plausible per-gram INR values, with 24K richer than 22K when present.
  if (!(gram22k > 5000 && gram22k < 60000)) return null;
  if (!isNaN(gram24k) && !(gram24k > gram22k && gram24k < 70000)) return null;
  return {
    gram22k,
    gram24k: isNaN(gram24k) ? 0 : gram24k,
    gram18k: isNaN(gram18k) ? 0 : gram18k,
    // Silver ~₹80–400/g retail; drop anything implausible so a stray match can't
    // poison the silver series.
    silverPerGram: silverPerGram > 30 && silverPerGram < 5000 ? silverPerGram : 0,
  };
}

/** Fetch + parse GRT's homepage rates. Null on any network/parse/sanity failure. */
async function fetchGrtRates(): Promise<GrtRates | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(GRT_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseGrtRates(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Percentage change of `current` vs the most recent EARLIER snapshot of `metal`
 * that came from GRT, read via `field`. Comparing only against another GRT day
 * keeps the day-over-day % on one consistent scale (a jump from older estimated
 * data would otherwise show a bogus double-digit move on the first GRT day).
 */
async function changeVsPrevGrtDay(
  metal: Metal,
  field: "retail22k" | "pricePerGram24k",
  sourceField: "retailSource" | "source",
  date: string,
  current: number
): Promise<{ prevClose: number; change: number; changePct: number }> {
  const prev = await MetalPrice.findOne({ metal, date: { $lt: date }, [sourceField]: GRT_SOURCE })
    .sort({ date: -1 })
    .lean();
  const prevClose = (prev?.[field] as number | undefined) ?? 0;
  const change = prevClose ? current - prevClose : 0;
  const changePct = prevClose ? Math.round((change / prevClose) * 100 * 100) / 100 : 0;
  return { prevClose, change, changePct };
}

/**
 * Scrape today's gold + silver rates from GRT and upsert one snapshot per metal
 * for the current IST day. Idempotent and polite: if today's snapshot for a
 * metal already came from GRT it is left alone (pass `{ force: true }` to
 * re-scrape). A failure on one metal never aborts the other.
 */
export async function refreshMetalPrices(opts: { force?: boolean } = {}): Promise<void> {
  if (!env.metals.enabled) return; // feature disabled — nothing to do
  const date = istDate();

  const [goldToday, silverToday] = await Promise.all([
    MetalPrice.findOne({ metal: "gold", date }).lean(),
    MetalPrice.findOne({ metal: "silver", date }).lean(),
  ]);
  const haveGold = goldToday?.retailSource === GRT_SOURCE;
  const haveSilver = silverToday?.source === GRT_SOURCE;
  if (haveGold && haveSilver && !opts.force) return; // already scraped today — save the trip

  const grt = await fetchGrtRates();
  if (!grt) {
    console.error("[metals] GRT scrape returned nothing; leaving existing snapshots in place");
    return;
  }

  // GOLD — GRT's Chennai retail is the headline (retail22k/24k/18k); the spot
  // fields are derived so other-city estimates still work. Change is measured
  // day-over-day against the previous GRT retail day.
  if (!haveGold || opts.force) {
    try {
      const { prevClose, change, changePct } = await changeVsPrevGrtDay(
        "gold",
        "retail22k",
        "retailSource",
        date,
        grt.gram22k
      );
      await MetalPrice.findOneAndUpdate(
        { metal: "gold", date },
        {
          $set: {
            currency: "INR",
            pricePerOunce: impliedSpotPerGram(grt.gram24k) * GRAMS_PER_TROY_OZ,
            pricePerGram24k: impliedSpotPerGram(grt.gram24k),
            pricePerGram22k: impliedSpotPerGram(grt.gram22k),
            pricePerGram18k: impliedSpotPerGram(grt.gram18k),
            prevClose,
            change,
            changePct,
            source: GRT_SOURCE,
            fetchedAt: new Date(),
            retail22k: grt.gram22k,
            retail24k: grt.gram24k,
            retail18k: grt.gram18k,
            retailSource: GRT_SOURCE,
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      console.log(`[metals] GRT gold ${date}: ₹${grt.gram22k}/g (22k), Δ ${changePct}%`);
    } catch (e) {
      console.error("[metals] gold upsert failed", e);
    }
  }

  // SILVER — GRT publishes a .999 retail per-gram rate; that IS the headline
  // (stored as pricePerGram24k, the field the silver card/chart plot). Skipped
  // when the scrape didn't yield a silver figure, so it retries next run.
  if ((!haveSilver || opts.force) && grt.silverPerGram > 0) {
    try {
      const { prevClose, change, changePct } = await changeVsPrevGrtDay(
        "silver",
        "pricePerGram24k",
        "source",
        date,
        grt.silverPerGram
      );
      await MetalPrice.findOneAndUpdate(
        { metal: "silver", date },
        {
          $set: {
            currency: "INR",
            pricePerOunce: grt.silverPerGram * GRAMS_PER_TROY_OZ,
            pricePerGram24k: grt.silverPerGram,
            // Silver is sold as .999 with no purity tiers, so the "22k/18k"
            // fields just mirror the single rate rather than showing ₹0.
            pricePerGram22k: grt.silverPerGram,
            pricePerGram18k: grt.silverPerGram,
            prevClose,
            change,
            changePct,
            source: GRT_SOURCE,
            fetchedAt: new Date(),
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      console.log(`[metals] GRT silver ${date}: ₹${grt.silverPerGram}/g, Δ ${changePct}%`);
    } catch (e) {
      console.error("[metals] silver upsert failed", e);
    }
  }
}

// Floor between user-triggered refreshes, so a few impatient clicks can't hammer
// grtjewels.com. The daily cron keeps running on its own schedule regardless.
const ON_DEMAND_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * User-triggered refresh: re-scrape today's GRT rate right now, subject to a
 * cooldown since the last fetch (on-demand or scheduled). Throws 429 with the
 * wait time remaining if called too soon.
 */
export async function refreshMetalPricesOnDemand(): Promise<void> {
  if (!env.metals.enabled) throw new HttpError(400, "Gold tracking isn't configured");

  const date = istDate();
  const gold = await MetalPrice.findOne({ metal: "gold", date }).lean();
  const lastFetchedAt = gold?.fetchedAt ? new Date(gold.fetchedAt).getTime() : 0;
  const elapsed = Date.now() - lastFetchedAt;
  if (elapsed < ON_DEMAND_COOLDOWN_MS) {
    const waitMin = Math.ceil((ON_DEMAND_COOLDOWN_MS - elapsed) / 60_000);
    throw new HttpError(429, `Rates were just refreshed. Try again in ${waitMin} minute${waitMin === 1 ? "" : "s"}.`);
  }

  await refreshMetalPrices({ force: true });
}

/**
 * True when today's (IST) gold snapshot exists and came from GRT — i.e. the
 * daily capture succeeded. Used to raise a loud log if a scheduled scrape
 * couldn't land today's rate, since GRT has no historical API: a day missed
 * entirely can only be recovered later by an (estimated) manual backfill.
 */
export async function isTodayCaptured(): Promise<boolean> {
  if (!env.metals.enabled) return true; // feature off — nothing to capture
  const gold = await MetalPrice.findOne({ metal: "gold", date: istDate() }).lean();
  return gold?.retailSource === GRT_SOURCE;
}

/** Latest stored snapshot for gold and silver, plus whether the feature is on. */
export async function getLatestMetals() {
  const [gold, silver] = await Promise.all([
    MetalPrice.findOne({ metal: "gold" }).sort({ date: -1 }).lean(),
    MetalPrice.findOne({ metal: "silver" }).sort({ date: -1 }).lean(),
  ]);
  return { configured: env.metals.enabled, gold, silver };
}

/** Daily snapshots for one metal, oldest → newest, capped to `days` points. */
export async function getMetalHistory(metal: Metal, days: number) {
  const rows = await MetalPrice.find({ metal }).sort({ date: -1 }).limit(days).lean();
  return rows.reverse();
}

const DAY_MS = 86_400_000;
/** Midnight-UTC epoch for a YYYY-MM-DD date. */
const dayTs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

// Every stored rate field is interpolated across a gap, so whichever field the
// chart reads for a given metal/city (gold Chennai → retail22k; other cities →
// pricePerGram22k + premium; silver → pricePerGram24k) lands on the line between
// the two neighbours and the plotted series stays continuous.
const GAP_FIELDS_GOLD = [
  "pricePerOunce", "pricePerGram24k", "pricePerGram22k", "pricePerGram18k",
  "retail22k", "retail24k", "retail18k",
] as const;
const GAP_FIELDS_SILVER = [
  "pricePerOunce", "pricePerGram24k", "pricePerGram22k", "pricePerGram18k",
] as const;

/** Minimal shape the gap planner reads off each stored snapshot. */
export interface GapBracket {
  date: string; // YYYY-MM-DD
  source?: string;
  [field: string]: unknown; // the numeric rate fields it interpolates
}

/**
 * PURE planner (no DB) behind {@link fillMetalGaps}: given one metal's snapshots
 * and options, return the interpolated snapshots that should be inserted to close
 * interior gaps. Linearly interpolates every stored rate field between the two
 * bracketing snapshots, so whichever field the chart reads (gold Chennai →
 * retail22k; other cities → pricePerGram22k + premium; silver → pricePerGram24k)
 * lands on the line between the neighbours and the plotted series stays
 * continuous. Exported so the interpolation/gating invariants can be unit-tested
 * without a database.
 *
 * Interior only — never extrapolates before the first snapshot or after the last
 * (today). It emits a candidate for EVERY interior day; the caller inserts them
 * insert-only, so existing/real days are never overwritten.
 *
 *   liveOnly (default true): bridge a gap only when BOTH brackets came from the
 *     live GRT scrape — targets exactly the "server was offline" gaps and leaves
 *     the deliberately weekday-only estimated history untouched.
 *   since: additionally, only emit dates on/after this YYYY-MM-DD.
 */
export function planMetalGapFill(
  rows: GapBracket[],
  metal: Metal,
  opts: { liveOnly?: boolean; since?: string } = {}
): GapBracket[] {
  const liveOnly = opts.liveOnly ?? true;
  const sinceTs = opts.since ? dayTs(opts.since) : -Infinity;
  const fields = metal === "gold" ? GAP_FIELDS_GOLD : GAP_FIELDS_SILVER;
  const sorted = [...rows].sort((x, y) => x.date.localeCompare(y.date));
  const out: GapBracket[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    // Only bridge between two live-captured days when liveOnly, so estimated
    // history (with its intentional weekend gaps) is never densified.
    if (liveOnly && !(a.source === GRT_SOURCE && b.source === GRT_SOURCE)) continue;

    const ta = dayTs(a.date);
    const tb = dayTs(b.date);
    if (!(tb - ta > DAY_MS)) continue; // adjacent days — no interior to fill

    for (let t = ta + DAY_MS; t < tb; t += DAY_MS) {
      if (t < sinceTs) continue;
      const date = new Date(t).toISOString().slice(0, 10);
      const f = (t - ta) / (tb - ta); // 0 → a, 1 → b

      const snap: GapBracket = {
        metal,
        currency: "INR",
        date,
        prevClose: 0,
        change: 0,
        changePct: 0,
        source: GAP_SOURCE,
      };
      for (const key of fields) {
        const av = Number(a[key] ?? 0);
        const bv = Number(b[key] ?? 0);
        const v = av + (bv - av) * f;
        // Retail figures are whole rupees like the live scrape; spot keeps precision.
        snap[key] = key.startsWith("retail") ? Math.round(v) : v;
      }
      if (metal === "gold") {
        snap.retailSource = GAP_GOLD_RETAIL_SOURCE;
      } else {
        snap.retail22k = 0;
        snap.retail24k = 0;
        snap.retail18k = 0;
        snap.retailSource = "";
      }
      out.push(snap);
    }
  }
  return out;
}

/**
 * Recover days the daily scrape never captured — most often because the server
 * was offline for a stretch — by interpolating between the snapshots we DO have
 * (see {@link planMetalGapFill}). GRT publishes only today's rate and has no
 * historical endpoint, so a missed day can't be re-fetched; interpolation is the
 * only recovery, and it keeps the chart continuous instead of drawing one
 * straight jump across the hole.
 *
 * Idempotent and non-destructive: each candidate is upserted `$setOnInsert`, so
 * an existing (metal, date) — real or estimated — is never overwritten and
 * re-runs are no-ops. Safe to call on every boot/cron with the default options.
 * Returns the number of interpolated day-snapshots inserted.
 */
export async function fillMetalGaps(
  opts: { liveOnly?: boolean; since?: string } = {}
): Promise<number> {
  if (!env.metals.enabled) return 0;
  let inserted = 0;

  for (const metal of METALS) {
    const rows = await MetalPrice.find({ metal }).sort({ date: 1 }).lean();
    const plan = planMetalGapFill(rows as unknown as GapBracket[], metal, opts);
    for (const snap of plan) {
      const res = await MetalPrice.updateOne(
        { metal, date: snap.date },
        { $setOnInsert: { ...snap, fetchedAt: new Date() } },
        { upsert: true }
      );
      if (res.upsertedCount) inserted++;
    }
  }

  if (inserted) console.log(`[metals] gap-fill: inserted ${inserted} interpolated day(s)`);
  return inserted;
}
