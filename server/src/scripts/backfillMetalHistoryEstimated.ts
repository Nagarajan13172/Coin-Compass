/**
 * One-off backfill of gold + silver history for the days BEFORE live tracking
 * began (site went up 01-Jul-2026), so the 90-day chart has a lead-in.
 *
 * WHY THIS EXISTS INSTEAD OF a GoldAPI dated pull: the GoldAPI free tier's
 * monthly quota is exhausted, and no free source publishes a clean DAILY series
 * (both metals) for Apr–Jun 2026 — only monthly aggregates + the last ~10 days.
 * So we reconstruct a trend-accurate daily series from REAL monthly anchors,
 * interpolated. Individual days are estimated, NOT real closes — the source
 * fields say so, and the page already carries a rates disclaimer.
 *
 *   npm --prefix server run backfill:metals:est -- --dry-run   # preview, no writes
 *   npm --prefix server run backfill:metals:est                # 2026-04-01 → 2026-06-30, weekdays
 *   npm --prefix server run backfill:metals:est -- --from 2026-04-16 --to 2026-06-30
 *
 * SAFE BY DESIGN:
 *  - A (metal, date) that already exists is SKIPPED (live/tracked days untouched,
 *    re-runs are no-ops). --force overwrites, but NEVER a real GRT-scraped day.
 *  - Purely local computation — no network, no API quota.
 *  - The daily cron only ADDS new dates, so tomorrow's GRT scrape stacks on top.
 *
 * SCALES (calibrated to the live July snapshots so the line is continuous):
 *  - Gold chart plots the Chennai retail 22K rate (`retail22k`). Anchors are the
 *    real Chennai monthly 22K figures (BankBazaar); 24K is derived at the live
 *    retail24k/retail22k ratio, and spot is back-derived at ÷1.152 (the Chennai
 *    premium) for the other-city fallback.
 *  - Silver chart plots spot `pricePerGram24k` (GoldAPI XAG), which runs ~₹180–191/g
 *    in July — far below the ₹230–290/g RETAIL the aggregators quote. So the real
 *    monthly retail SHAPE is rescaled by ×0.751 (= Jul-spot 184 / Jun-retail 245)
 *    onto the spot scale, landing Jun-30 on the July connect point.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { MetalPrice, METALS, type Metal } from "../models/MetalPrice";

const OZ_TO_GRAM = 31.1034768;
const CHENNAI_PREMIUM = 1.152; // spot → Chennai retail (calibrated to GRT on 01-Jul-2026)
const RETAIL_24K_OVER_22K = 1.0917; // from the live July retail24k/retail22k ratio
const SRC = "estimated · monthly-anchor interpolation";
const GOLD_RETAIL_SRC = "Estimated · Chennai aggregator monthly (interpolated)";

interface Anchor {
  date: string; // YYYY-MM-DD
  v: number;
}

/**
 * Chennai 22K retail ₹/g monthly anchors (BankBazaar monthly figures), placed at
 * mid-month, plus the real 01-Jul connect point from the live DB. Values before
 * the first anchor hold flat.
 */
const GOLD_22K_RETAIL: Anchor[] = [
  { date: "2026-04-15", v: 14120 },
  { date: "2026-05-15", v: 14481 },
  { date: "2026-06-15", v: 13350 },
  { date: "2026-07-01", v: 13180 }, // live DB retail22k on 02-Jul — endpoint only, not written
];

/**
 * Silver SPOT ₹/g anchors: the real Chennai monthly retail moves (Goodreturns —
 * open/high/low/close with their reported dates) rescaled ×0.751 onto the July
 * spot scale, so shape is preserved and Jun-30 meets the live spot (~₹184/g).
 */
const SILVER_SPOT: Anchor[] = [
  { date: "2026-04-01", v: 199 }, // 265 open
  { date: "2026-04-18", v: 210 }, // 280 high
  { date: "2026-04-30", v: 203 }, // 270 close
  { date: "2026-05-01", v: 199 }, // 265 open
  { date: "2026-05-13", v: 240 }, // 320 high
  { date: "2026-05-31", v: 218 }, // 290 close
  { date: "2026-06-01", v: 218 }, // 290 open
  { date: "2026-06-25", v: 173 }, // 230 low
  { date: "2026-06-30", v: 184 }, // 245 close → equals July spot connect
];

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
const ts = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Piecewise-linear interpolation over dated anchors; flat before first / after last. */
function interp(anchors: Anchor[], iso: string): number {
  const t = ts(iso);
  if (t <= ts(anchors[0].date)) return anchors[0].v;
  const last = anchors[anchors.length - 1];
  if (t >= ts(last.date)) return last.v;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ta = ts(a.date);
    const tb = ts(b.date);
    if (t >= ta && t <= tb) {
      const f = (t - ta) / (tb - ta);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v; // unreachable
}

/** Inclusive YYYY-MM-DD list in [from, to], iterated in UTC. */
function eachDate(fromISO: string, toISO: string, includeWeekends: boolean): string[] {
  const out: string[] = [];
  const start = ts(fromISO);
  const end = ts(toISO);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return out;
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (!includeWeekends && (dow === 0 || dow === 6)) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function goldSnapshot(date: string) {
  const retail22 = Math.round(interp(GOLD_22K_RETAIL, date));
  const retail24 = Math.round(retail22 * RETAIL_24K_OVER_22K);
  const retail18 = Math.round(retail24 * (18 / 24));
  const spot24 = retail24 / CHENNAI_PREMIUM;
  return {
    metal: "gold" as Metal,
    currency: "INR",
    date,
    pricePerOunce: spot24 * OZ_TO_GRAM,
    pricePerGram24k: spot24,
    pricePerGram22k: retail22 / CHENNAI_PREMIUM,
    pricePerGram18k: retail18 / CHENNAI_PREMIUM,
    prevClose: 0,
    change: 0,
    changePct: 0,
    source: SRC,
    fetchedAt: new Date(),
    retail22k: retail22,
    retail24k: retail24,
    retail18k: retail18,
    retailSource: GOLD_RETAIL_SRC,
  };
}

function silverSnapshot(date: string) {
  const g24 = Math.round(interp(SILVER_SPOT, date));
  return {
    metal: "silver" as Metal,
    currency: "INR",
    date,
    pricePerOunce: g24 * OZ_TO_GRAM,
    pricePerGram24k: g24,
    pricePerGram22k: g24 * (22 / 24),
    pricePerGram18k: g24 * (18 / 24),
    prevClose: 0,
    change: 0,
    changePct: 0,
    source: SRC,
    fetchedAt: new Date(),
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const includeWeekends = hasFlag("--include-weekends");
  const from = (arg("--from") ?? "2026-04-01").trim();
  const to = (arg("--to") ?? "2026-06-30").trim();

  const dates = eachDate(from, to, includeWeekends);
  if (dates.length === 0) {
    console.error(`No dates in range ${from} → ${to} (check order/format).`);
    process.exit(1);
  }
  console.log(
    `Estimated backfill: ${from} → ${to} · ${dates.length} day(s) × ${METALS.length} metals ` +
      `(${includeWeekends ? "incl." : "excl."} weekends)${dryRun ? "  [DRY RUN]" : ""}`
  );

  await connectDB();

  let wrote = 0;
  let skipped = 0;
  for (const date of dates) {
    for (const metal of METALS) {
      const existing = await MetalPrice.findOne({ metal, date }).lean();
      // Never clobber a real GRT-scraped day, even with --force.
      const isRealGrt = /grtjewels/i.test(existing?.retailSource ?? "");
      if (existing && (!force || isRealGrt)) {
        skipped++;
        continue;
      }
      const snap = metal === "gold" ? goldSnapshot(date) : silverSnapshot(date);
      if (dryRun) {
        wrote++;
        const shown =
          "retail22k" in snap ? `retail22k ₹${snap.retail22k}` : `₹${snap.pricePerGram24k}/g`;
        console.log(`  · ${metal} ${date}: ${shown}`);
        continue;
      }
      await MetalPrice.findOneAndUpdate({ metal, date }, { $set: snap }, {
        upsert: true,
        setDefaultsOnInsert: true,
      });
      wrote++;
    }
  }

  await mongoose.disconnect();
  const verb = dryRun ? "would write" : "wrote";
  console.log(`\n✓ Done — ${verb}: ${wrote}, skipped (already present): ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Estimated metal backfill failed:", err);
  process.exit(1);
});
