/*
 * PRODUCTION metal-history backfill — runs INSIDE the Mongo container via mongosh,
 * so it needs no exposed DB port, no rebuild, and no GoldAPI quota (pure math).
 *
 *   docker exec -i money-tracker-mongo mongosh --quiet money-tracker < backfillMetalsProd.mongo.js
 *
 * It reconstructs the Apr 1 – Jun 30 2026 daily gold + silver series from real
 * monthly anchors (see backfillMetalHistoryEstimated.ts for the full rationale),
 * calibrated so Jun-30 meets the live July connect point.
 *
 * SAFE: idempotent — any (metal,date) that already exists is SKIPPED, and inserts
 * use $setOnInsert so an existing row (incl. real GRT days) is never modified.
 * Re-running is a no-op. The daily cron/GRT scrape only ADD new dates, untouched.
 */
(function () {
const FROM = "2026-04-01";
const TO = "2026-06-30";
const INCLUDE_WEEKENDS = false;

const OZ_TO_GRAM = 31.1034768;
const CHENNAI_PREMIUM = 1.152; // spot -> Chennai retail (calibrated to GRT 01-Jul-2026)
const RETAIL_24K_OVER_22K = 1.0917; // from live July retail24k/retail22k
const SRC = "estimated · monthly-anchor interpolation";
const GOLD_RETAIL_SRC = "Estimated · Chennai aggregator monthly (interpolated)";

// Chennai 22K retail Rs/g monthly anchors (BankBazaar), mid-month, + live 01-Jul connect.
// >> To track the higher GoldMeter/Goodreturns readings instead, raise these. <<
const GOLD_22K_RETAIL = [
  { date: "2026-04-15", v: 14120 },
  { date: "2026-05-15", v: 14481 },
  { date: "2026-06-15", v: 13350 },
  { date: "2026-07-01", v: 13180 }, // endpoint only (not written) — live DB retail22k
];
// Silver SPOT Rs/g anchors: real Goodreturns monthly O/H/L/C rescaled x0.751 onto the
// July spot scale, so Jun-30 (=184) meets the live spot connect point.
const SILVER_SPOT = [
  { date: "2026-04-01", v: 199 },
  { date: "2026-04-18", v: 210 },
  { date: "2026-04-30", v: 203 },
  { date: "2026-05-01", v: 199 },
  { date: "2026-05-13", v: 240 },
  { date: "2026-05-31", v: 218 },
  { date: "2026-06-01", v: 218 },
  { date: "2026-06-25", v: 173 },
  { date: "2026-06-30", v: 184 },
];

function ts(iso) {
  return Date.parse(iso + "T00:00:00Z");
}
function interp(anchors, iso) {
  const t = ts(iso);
  if (t <= ts(anchors[0].date)) return anchors[0].v;
  const last = anchors[anchors.length - 1];
  if (t >= ts(last.date)) return last.v;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ta = ts(a.date);
    const tb = ts(b.date);
    if (t >= ta && t <= tb) return a.v + (b.v - a.v) * ((t - ta) / (tb - ta));
  }
  return last.v;
}
function eachDate(fromISO, toISO, incWk) {
  const out = [];
  for (let t = ts(fromISO); t <= ts(toISO); t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (!incWk && (dow === 0 || dow === 6)) continue;
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
function goldSnap(date, now) {
  const retail22 = Math.round(interp(GOLD_22K_RETAIL, date));
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
    source: SRC, fetchedAt: now,
    retail22k: retail22, retail24k: retail24, retail18k: retail18, retailSource: GOLD_RETAIL_SRC,
    createdAt: now, updatedAt: now, __v: 0,
  };
}
function silverSnap(date, now) {
  const g24 = Math.round(interp(SILVER_SPOT, date));
  return {
    metal: "silver", currency: "INR", date,
    pricePerOunce: g24 * OZ_TO_GRAM,
    pricePerGram24k: g24,
    pricePerGram22k: g24 * (22 / 24),
    pricePerGram18k: g24 * (18 / 24),
    prevClose: 0, change: 0, changePct: 0,
    source: SRC, fetchedAt: now,
    retail22k: 0, retail24k: 0, retail18k: 0, retailSource: "",
    createdAt: now, updatedAt: now, __v: 0,
  };
}

const now = new Date();
const dates = eachDate(FROM, TO, INCLUDE_WEEKENDS);
let wrote = 0;
let skipped = 0;
for (const date of dates) {
  for (const metal of ["gold", "silver"]) {
    if (db.metalprices.findOne({ metal, date }, { _id: 1 })) {
      skipped++;
      continue;
    }
    const snap = metal === "gold" ? goldSnap(date, now) : silverSnap(date, now);
    // $setOnInsert => only ever inserts; never modifies an existing row.
    db.metalprices.updateOne({ metal, date }, { $setOnInsert: snap }, { upsert: true });
    wrote++;
  }
}
print(
  "\n[backfill] " + FROM + " -> " + TO + " (" + dates.length + " days x 2 metals): wrote " +
    wrote + ", skipped (already present) " + skipped
);
})();
