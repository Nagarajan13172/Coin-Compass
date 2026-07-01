import { env } from "../config/env";
import { MetalPrice, METALS, type Metal } from "../models/MetalPrice";

/** GoldAPI symbol for each metal we track. */
const SYMBOL: Record<Metal, string> = { gold: "XAU", silver: "XAG" };

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

/** Shape of the fields we use from a GoldAPI.io /api/{symbol}/INR response. */
interface GoldApiResponse {
  price: number; // per troy ounce, in INR
  prev_close_price?: number;
  ch?: number; // absolute change vs prev close
  chp?: number; // percent change vs prev close
  price_gram_24k?: number;
  price_gram_22k?: number;
  price_gram_18k?: number;
}

async function fetchMetal(metal: Metal): Promise<GoldApiResponse> {
  const url = `https://www.goldapi.io/api/${SYMBOL[metal]}/INR`;
  // Bound the request so a slow/hung API can never stall server startup.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "x-access-token": env.metals.apiKey, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GoldAPI ${metal} responded ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as GoldApiResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GRT Jewellers publishes no API, but their homepage embeds the current rates
 * as JSON (`"purity":"22 KT","amount":12905`). Reading that directly means our
 * figure matches exactly what shoppers see on grtjewels.com.
 */
const GRT_URL = "https://www.grtjewels.com/";

/** Source marker stored on GRT snapshots; a mismatch triggers a re-scrape. */
const GRT_SOURCE = "GRT · grtjewels.com";

interface GrtRate {
  gram22k: number;
  gram24k: number;
  gram18k: number;
}

/**
 * Scrape GRT's published per-gram gold rates (22K/24K/18K) from grtjewels.com.
 * Best-effort: returns null on any network/parse/sanity failure so the caller
 * falls back to the spot price + a calibrated premium.
 */
async function fetchGrtChennaiRate(): Promise<GrtRate | null> {
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
    // The rate JSON sits inside a JS string, so its quotes are backslash-escaped;
    // unescape first, then read each purity's amount.
    const norm = (await res.text()).replace(/\\"/g, '"');
    const pick = (kt: number): number => {
      const m = norm.match(new RegExp(`"purity":"${kt}\\s*KT","amount":([0-9]+(?:\\.[0-9]+)?)`));
      return m ? parseFloat(m[1]) : NaN;
    };
    let gram22k = pick(22);
    const gram24k = pick(24);
    const gram18k = pick(18);
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
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch today's gold + silver rates and upsert one snapshot per metal for the
 * current IST day. Idempotent and quota-friendly: if today's snapshot already
 * exists it is skipped (pass `{ force: true }` to refetch). Failures for one
 * metal are logged and don't abort the other.
 */
export async function refreshMetalPrices(opts: { force?: boolean } = {}): Promise<void> {
  if (!env.metals.configured) return; // feature disabled — nothing to do
  const date = istDate();

  for (const metal of METALS) {
    try {
      const existing = await MetalPrice.findOne({ metal, date }).lean();
      if (existing && !opts.force) continue; // already have today's — save the quota

      const r = await fetchMetal(metal);
      const prevClose = r.prev_close_price ?? 0;
      const change = r.ch ?? (prevClose ? r.price - prevClose : 0);
      const changePct = r.chp ?? (prevClose ? (change / prevClose) * 100 : 0);

      const update: Record<string, unknown> = {
        metal,
        currency: "INR",
        date,
        pricePerOunce: r.price,
        pricePerGram24k: r.price_gram_24k ?? 0,
        pricePerGram22k: r.price_gram_22k ?? 0,
        pricePerGram18k: r.price_gram_18k ?? 0,
        prevClose,
        change,
        changePct,
        source: env.metals.provider,
        fetchedAt: new Date(),
      };

      await MetalPrice.findOneAndUpdate({ metal, date }, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });
      console.log(`[metals] ${metal} ${date}: ₹${r.price_gram_24k}/g (24k)`);
    } catch (e) {
      console.error(`[metals] failed to refresh ${metal}`, e);
    }
  }

  // Refresh GRT's actual Chennai retail rate onto today's gold snapshot. This is
  // a FREE scrape (no GoldAPI quota), so it runs independently of the spot guard
  // above — it populates today even when the spot snapshot already existed, and
  // retries on the next run if it previously failed (retail stays 0).
  try {
    const goldDoc = await MetalPrice.findOne({ metal: "gold", date }).lean();
    // Re-scrape when today's snapshot isn't yet from GRT (missing or a prior
    // source), so a source switch self-heals; otherwise skip to run once a day.
    if (goldDoc && (goldDoc.retailSource !== GRT_SOURCE || opts.force)) {
      const grt = await fetchGrtChennaiRate();
      if (grt) {
        await MetalPrice.updateOne(
          { metal: "gold", date },
          {
            retail22k: grt.gram22k,
            retail24k: grt.gram24k,
            retail18k: grt.gram18k,
            retailSource: GRT_SOURCE,
          }
        );
        console.log(`[metals] GRT grtjewels.com ${date}: ₹${grt.gram22k}/g (22k)`);
      }
    }
  } catch (e) {
    console.error("[metals] GRT Chennai scrape failed", e);
  }
}

/** Latest stored snapshot for gold and silver, plus whether the feature is on. */
export async function getLatestMetals() {
  const [gold, silver] = await Promise.all([
    MetalPrice.findOne({ metal: "gold" }).sort({ date: -1 }).lean(),
    MetalPrice.findOne({ metal: "silver" }).sort({ date: -1 }).lean(),
  ]);
  return { configured: env.metals.configured, gold, silver };
}

/** Daily snapshots for one metal, oldest → newest, capped to `days` points. */
export async function getMetalHistory(metal: Metal, days: number) {
  const rows = await MetalPrice.find({ metal }).sort({ date: -1 }).limit(days).lean();
  return rows.reverse();
}
