/*
 * PRODUCTION one-off backfill for the 16–17 Jul 2026 gold + silver GAP — runs
 * INSIDE the Mongo container via mongosh, so it needs no exposed DB port, no
 * rebuild, and no third-party API.
 *
 *   docker exec -i money-tracker-mongo mongosh --quiet money-tracker < backfillMetalsJulyGap.mongo.js
 *   (or just run scripts/backfill-metals-july-gap.sh on the server)
 *
 * WHY THIS EXISTS: while GoldAPI's quota was exhausted, the old refresh gated the
 * GRT scrape behind a GoldAPI snapshot, so 16–17 Jul were never captured. GRT has
 * NO historical endpoint, so those days can't be re-scraped — they must be
 * inserted from the real published Chennai rates. Values are the actual daily
 * Chennai retail (dtnext/Goodreturns), consistent with the bracketing LIVE GRT
 * days (15 Jul 22K ₹13,160 → 18 Jul ₹13,065). Derivation matches the live GRT
 * upsert (retail24 = 22K ×1.0917, retail18 = 24K ×0.75, spot = retail ÷1.152).
 *
 * SAFE: idempotent — any (metal,date) already present is SKIPPED, and inserts use
 * $setOnInsert, so an existing row (esp. a real GRT day) is never modified.
 * Re-running is a no-op. The daily GRT scrape only ADDS new dates, untouched.
 */
(function () {
  const OZ_TO_GRAM = 31.1034768;
  const CHENNAI_PREMIUM = 1.152; // spot -> Chennai retail (calibrated to GRT 01-Jul-2026)
  const RETAIL_24K_OVER_22K = 1.0917; // from live July retail24k/retail22k
  const GOLD_SRC = "estimated · daily aggregator";
  const GOLD_RETAIL_SRC = "Estimated · Chennai daily aggregator";
  const SILVER_SRC = "estimated · daily aggregator";

  // Real Chennai retail rates for the missing days (₹/g). Add more entries here if
  // prod turns out to be missing other recent days — keep them on the GRT scale.
  const GOLD_22K = { "2026-07-16": 13150, "2026-07-17": 13100 };
  const SILVER_PER_G = { "2026-07-16": 240, "2026-07-17": 235 };

  function goldSnap(date, retail22, now) {
    const retail24 = Math.round(retail22 * RETAIL_24K_OVER_22K);
    const retail18 = Math.round(retail24 * (18 / 24));
    const spot24 = retail24 / CHENNAI_PREMIUM;
    return {
      metal: "gold", currency: "INR", date,
      pricePerOunce: spot24 * OZ_TO_GRAM,
      pricePerGram24k: spot24,
      pricePerGram22k: retail22 / CHENNAI_PREMIUM,
      pricePerGram18k: retail18 / CHENNAI_PREMIUM,
      prevClose: 0, change: 0, changePct: 0,
      source: GOLD_SRC, fetchedAt: now,
      retail22k: retail22, retail24k: retail24, retail18k: retail18, retailSource: GOLD_RETAIL_SRC,
      createdAt: now, updatedAt: now, __v: 0,
    };
  }
  function silverSnap(date, perG, now) {
    // Silver is sold .999 with no purity tiers; the single ₹/g rate fills all
    // three fields (matches the live GRT silver upsert).
    return {
      metal: "silver", currency: "INR", date,
      pricePerOunce: perG * OZ_TO_GRAM,
      pricePerGram24k: perG, pricePerGram22k: perG, pricePerGram18k: perG,
      prevClose: 0, change: 0, changePct: 0,
      source: SILVER_SRC, fetchedAt: now,
      retail22k: 0, retail24k: 0, retail18k: 0, retailSource: "",
      createdAt: now, updatedAt: now, __v: 0,
    };
  }

  const now = new Date();
  let wrote = 0;
  let skipped = 0;
  for (const date of Object.keys(GOLD_22K)) {
    const jobs = [
      ["gold", goldSnap(date, GOLD_22K[date], now)],
      ["silver", silverSnap(date, SILVER_PER_G[date], now)],
    ];
    for (const [metal, snap] of jobs) {
      if (db.metalprices.findOne({ metal, date }, { _id: 1 })) {
        skipped++;
        continue;
      }
      // $setOnInsert => only ever inserts; never modifies an existing row.
      db.metalprices.updateOne({ metal, date }, { $setOnInsert: snap }, { upsert: true });
      wrote++;
    }
  }
  print("\n[july-gap backfill] wrote " + wrote + ", skipped (already present) " + skipped);
})();
