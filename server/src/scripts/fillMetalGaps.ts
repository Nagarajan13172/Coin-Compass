/**
 * Recover gaps in the gold/silver daily series by interpolating between the
 * snapshots we DO have — for days the scrape never captured (most often because
 * the server was offline for a stretch). GRT publishes only today's rate and has
 * no historical endpoint, so interpolation is the only way to recover a missed
 * day and keep the history chart continuous.
 *
 *   npm --prefix server run gapfill:metals                       # live-bracketed gaps only (safe default)
 *   npm --prefix server run gapfill:metals -- --all --since 2026-07-01   # every hole on/after a date
 *   npm --prefix server run gapfill:metals -- --all              # every interior hole (incl. estimated era)
 *
 * SAFE BY DESIGN (see fillMetalGaps in metalPriceService):
 *  - Interior only — never extrapolates past the first/last snapshot.
 *  - Inserts a missing (metal,date) only; an existing/real GRT day is never touched.
 *  - Idempotent — re-running is a no-op. Purely local computation, no network.
 *
 * The daily boot/cron already runs the DEFAULT (live-bracketed) fill on its own,
 * so this script is for a manual/prod recovery or a wider one-off (--all/--since),
 * e.g. to also close pre-live estimated-era holes.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { fillMetalGaps } from "../services/metalPriceService";

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

async function main() {
  // `--all` widens the fill beyond live-bracketed gaps to every interior hole
  // (needed to close pre-live estimated/goldapi-era days); pair with --since to
  // bound how far back it reaches.
  const liveOnly = !hasFlag("--all");
  const since = arg("--since")?.trim();

  await connectDB();
  const inserted = await fillMetalGaps({ liveOnly, since });
  await mongoose.disconnect();

  console.log(
    `\n✓ Gap-fill done — inserted ${inserted} interpolated day(s) ` +
      `(${liveOnly ? "live-bracketed gaps only" : "all interior gaps"}` +
      `${since ? `, on/after ${since}` : ""}).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Metal gap-fill failed:", err);
  process.exit(1);
});
