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
  const res = await fetch(url, {
    headers: { "x-access-token": env.metals.apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GoldAPI ${metal} responded ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as GoldApiResponse;
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

      await MetalPrice.findOneAndUpdate(
        { metal, date },
        {
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
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[metals] ${metal} ${date}: ₹${r.price_gram_24k}/g (24k)`);
    } catch (e) {
      console.error(`[metals] failed to refresh ${metal}`, e);
    }
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
