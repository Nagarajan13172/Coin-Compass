/**
 * One-off backfill: fill in the gold + silver history for the days BEFORE we
 * started tracking live (site went up 01-Jul-2026), so the 90-day chart has a
 * proper lead-in instead of starting mid-window.
 *
 *   npm --prefix server run backfill:metals -- --dry-run     # show what it would do, no API/DB writes
 *   npm --prefix server run backfill:metals                  # 2026-04-01 → 2026-06-30, weekdays
 *   npm --prefix server run backfill:metals -- --from 2026-04-16 --to 2026-06-30
 *   npm --prefix server run backfill:metals -- --include-weekends
 *
 * Source: GoldAPI.io's DATED endpoint (/api/XAU|XAG/INR/YYYYMMDD) — the same
 * provider we already use, so the numbers are consistent with the live spot.
 *
 * IMPORTANT — this never disturbs existing data:
 *  - A (metal, date) that already has a snapshot is SKIPPED (so live/tracked days
 *    and re-runs are untouched). Pass --force to refetch, and even then only the
 *    spot fields are updated — a real GRT `retail*` rate is preserved.
 *  - It writes only spot fields; gold has no historical GRT retail (GRT only
 *    publishes today), so those days render as spot + the city premium (the app
 *    already marks them "approx"). Silver plots its per-gram rate directly.
 *  - The daily cron only ever ADDS new dates, so tomorrow's GRT scrape stacks on
 *    top of this backfill with no changes anywhere else.
 *
 * Quota: ~1 call per (weekday × metal). The default range is ~64 weekdays × 2
 * metals ≈ 128 calls, spent once. Weekends are skipped (markets closed) unless
 * --include-weekends is passed.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { env } from "../config/env";
import { MetalPrice, METALS, type Metal } from "../models/MetalPrice";

/** GoldAPI symbol for each metal (matches metalPriceService). */
const SYMBOL: Record<Metal, string> = { gold: "XAU", silver: "XAG" };
const OZ_TO_GRAM = 31.1034768; // troy ounce → grams

function arg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = args.indexOf(flag);
  const next = args[i + 1];
  if (i >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}
const hasFlag = (flag: string) => process.argv.slice(2).includes(flag);

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Inclusive list of YYYY-MM-DD dates in [from, to], iterated in UTC to avoid TZ drift. */
function eachDate(fromISO: string, toISO: string, includeWeekends: boolean): string[] {
  const out: string[] = [];
  const start = Date.parse(`${fromISO}T00:00:00Z`);
  const end = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return out;
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const dow = d.getUTCDay(); // 0 Sun … 6 Sat
    if (!includeWeekends && (dow === 0 || dow === 6)) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Fields we read from a GoldAPI dated response (superset of the live shape). */
interface GoldApiHistorical {
  price: number; // per troy ounce, INR
  prev_close_price?: number;
  ch?: number;
  chp?: number;
  price_gram_24k?: number;
  price_gram_22k?: number;
  price_gram_18k?: number;
}

/** Raised when GoldAPI reports the quota is exhausted, so we stop instead of hammering. */
class QuotaError extends Error {}

async function fetchHistorical(metal: Metal, isoDate: string): Promise<GoldApiHistorical> {
  const ymd = isoDate.replace(/-/g, "");
  const url = `https://www.goldapi.io/api/${SYMBOL[metal]}/INR/${ymd}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { "x-access-token": env.metals.apiKey, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // GoldAPI signals an exhausted quota with 429 OR a 403 whose body says "quota".
      if (res.status === 429 || (res.status === 403 && /quota/i.test(body))) {
        throw new QuotaError(`GoldAPI quota exhausted (HTTP ${res.status})`);
      }
      throw new Error(`GoldAPI ${metal} ${isoDate} responded ${res.status}: ${body.slice(0, 160)}`);
    }
    return (await res.json()) as GoldApiHistorical;
  } finally {
    clearTimeout(timer);
  }
}

/** Build the spot snapshot fields for one metal/day. Retail* is intentionally omitted. */
function toSnapshot(metal: Metal, date: string, r: GoldApiHistorical) {
  const gram24 = r.price_gram_24k ?? r.price / OZ_TO_GRAM;
  const gram22 = r.price_gram_22k ?? gram24 * (22 / 24);
  const gram18 = r.price_gram_18k ?? gram24 * (18 / 24);
  const prevClose = r.prev_close_price ?? 0;
  const change = r.ch ?? (prevClose ? r.price - prevClose : 0);
  const changePct = r.chp ?? (prevClose ? (change / prevClose) * 100 : 0);
  return {
    metal,
    currency: "INR",
    date,
    pricePerOunce: r.price,
    pricePerGram24k: gram24,
    pricePerGram22k: gram22,
    pricePerGram18k: gram18,
    prevClose,
    change,
    changePct,
    source: "goldapi.io · historical backfill",
    fetchedAt: new Date(),
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const includeWeekends = hasFlag("--include-weekends");
  const from = (arg("--from") ?? "2026-04-01").trim();
  const to = (arg("--to") ?? "2026-06-30").trim();
  const delayMs = Number(arg("--delay") ?? 300);

  if (!env.metals.goldApiConfigured && !dryRun) {
    console.error("GOLD_API_KEY is not set — this GoldAPI backfill needs a key. Set it in server/.env, or use --dry-run.");
    process.exit(1);
  }

  const dates = eachDate(from, to, includeWeekends);
  if (dates.length === 0) {
    console.error(`No dates in range ${from} → ${to} (check the order / format).`);
    process.exit(1);
  }
  console.log(
    `Backfill window: ${from} → ${to} · ${dates.length} day(s) × ${METALS.length} metals ` +
      `(${includeWeekends ? "incl." : "excl."} weekends)${dryRun ? "  [DRY RUN]" : ""}`
  );

  await connectDB();

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const date of dates) {
      for (const metal of METALS) {
        const existing = await MetalPrice.findOne({ metal, date }).lean();
        if (existing && !force) {
          skipped++;
          continue;
        }
        if (dryRun) {
          inserted++; // "would fetch"
          console.log(`  · would fetch ${metal} ${date}`);
          continue;
        }
        try {
          const r = await fetchHistorical(metal, date);
          const snap = toSnapshot(metal, date, r);
          // $set only spot fields → a real GRT retail* on an existing day is preserved.
          await MetalPrice.findOneAndUpdate({ metal, date }, { $set: snap }, {
            upsert: true,
            setDefaultsOnInsert: true,
          });
          inserted++;
          console.log(`  ✓ ${metal} ${date}: ₹${snap.pricePerGram24k.toFixed(2)}/g (24k)`);
          await sleep(delayMs); // be gentle on the free tier
        } catch (e) {
          if (e instanceof QuotaError) throw e; // stop the whole run
          failed++;
          console.warn(`  ✗ ${metal} ${date}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } catch (e) {
    if (e instanceof QuotaError) {
      console.error(`\n⚠ ${e.message} — stopping early. ${inserted} written so far; re-run later to resume (it skips what's already stored).`);
    } else {
      throw e;
    }
  }

  await mongoose.disconnect();
  const verb = dryRun ? "would write" : "written";
  console.log(`\n✓ Done — ${verb}: ${inserted}, skipped (already present): ${skipped}, failed: ${failed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Metal backfill failed:", err);
  process.exit(1);
});
