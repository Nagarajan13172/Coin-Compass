import { env } from "../config/env";
import { Instrument, type Exchange } from "../models/Instrument";
import { StockPrice } from "../models/StockPrice";
import { StockLot } from "../models/StockLot";
import { HttpError } from "../middleware/errorHandler";

/**
 * Live equity prices from Yahoo Finance's public chart endpoint.
 *
 * Two upstream facts shape everything below:
 *
 *   1. There is no working batch quote — `/v7/finance/quote?symbols=A,B` answers
 *      401 without a session crumb. Every symbol therefore costs one round trip,
 *      which is why prices are stored GLOBALLY (one row per symbol per day, no
 *      user field) and refreshed only for symbols someone actually holds.
 *   2. Numeric BSE scrip codes resolve to the wrong instrument ("500325.BO"
 *      returns a stale mutual-fund record). Symbols only ever enter the app
 *      through searchInstruments(), never from user input.
 *
 * The endpoint is undocumented and unversioned, so all network access is behind
 * the two fetch* functions and both parsers are pure — a provider change is a
 * change to this file alone.
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
const SOURCE = "Yahoo Finance";

/** Upstream rejects requests without a browser-shaped agent. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

/** Today's date as YYYY-MM-DD in IST, so "today" matches the Indian market day. */
export function istDate(d = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Yahoo's exchange suffix → our exchange enum. Anything else isn't tradable here. */
function exchangeFromSymbol(symbol: string): Exchange | null {
  if (symbol.endsWith(".NS")) return "NSE";
  if (symbol.endsWith(".BO")) return "BSE";
  return null;
}

// ---- Pure parsers (no network, so they can be tested against saved fixtures) ----

export interface ParsedQuote {
  symbol: string;
  currency: string;
  close: number;
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  volume: number;
  longName: string;
  shortName: string;
}

/**
 * Read a quote out of a v8 chart response. Returns null when the payload is an
 * error, is missing a usable price, or is not quoted in INR — a non-INR symbol
 * (Yahoo happily serves INFY on NYSE in USD) must never reach net worth, where
 * it would be silently added to a rupee total.
 */
export function parseChartQuote(json: unknown): ParsedQuote | null {
  const meta = (json as any)?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const close = Number(meta.regularMarketPrice);
  if (!Number.isFinite(close) || close <= 0) return null;
  if (meta.currency !== "INR") return null;

  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    symbol: String(meta.symbol ?? ""),
    currency: "INR",
    close,
    prevClose: num(meta.chartPreviousClose),
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    week52High: num(meta.fiftyTwoWeekHigh),
    week52Low: num(meta.fiftyTwoWeekLow),
    volume: num(meta.regularMarketVolume),
    longName: String(meta.longName ?? ""),
    shortName: String(meta.shortName ?? ""),
  };
}

export interface ParsedSearchHit {
  symbol: string;
  ticker: string;
  exchange: Exchange;
  shortName: string;
  longName: string;
  sector: string;
  industry: string;
}

/**
 * Read NSE/BSE equities out of a search response, dropping everything else —
 * foreign listings, ETFs quoted abroad, currencies, and the news block. Only
 * equities on an Indian exchange can be held here, so filtering at the parser
 * keeps non-INR instruments out of the picker entirely rather than rejecting
 * them later at add-time.
 */
export function parseSearchHits(json: unknown): ParsedSearchHit[] {
  const quotes = (json as any)?.quotes;
  if (!Array.isArray(quotes)) return [];

  const hits: ParsedSearchHit[] = [];
  for (const q of quotes) {
    const symbol = String(q?.symbol ?? "");
    const exchange = exchangeFromSymbol(symbol);
    if (!exchange) continue;
    if (q?.quoteType !== "EQUITY") continue;

    hits.push({
      symbol,
      ticker: symbol.replace(/\.(NS|BO)$/, ""),
      exchange,
      shortName: String(q?.shortname ?? ""),
      longName: String(q?.longname ?? q?.shortname ?? ""),
      sector: String(q?.sector ?? ""),
      industry: String(q?.industry ?? ""),
    });
  }
  return hits;
}

// ---- Network ----

/** GET + parse JSON with a timeout. Null on any network/HTTP/parse failure. */
async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) return null; // 404 = delisted/unknown symbol; 401/429 = throttled
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fixed figures the "stub" provider answers with. Every symbol prices at ₹100
 * (previous close ₹99), so a test can predict a portfolio's value exactly from
 * the quantities it bought. Deliberately boring: the point is determinism.
 */
const STUB_CLOSE = 100;
const STUB_PREV_CLOSE = 99;

function stubQuote(symbol: string): ParsedQuote {
  const ticker = symbol.replace(/\.(NS|BO)$/, "");
  return {
    symbol,
    currency: "INR",
    close: STUB_CLOSE,
    prevClose: STUB_PREV_CLOSE,
    dayHigh: STUB_CLOSE,
    dayLow: STUB_PREV_CLOSE,
    week52High: STUB_CLOSE,
    week52Low: STUB_PREV_CLOSE,
    volume: 0,
    longName: `${ticker} Test Instrument`,
    shortName: ticker,
  };
}

/** Live quote for one symbol. Null when upstream has nothing usable for it. */
async function fetchQuote(symbol: string): Promise<ParsedQuote | null> {
  if (env.stocks.provider === "stub") return stubQuote(symbol);
  const json = await getJson(`${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  return json ? parseChartQuote(json) : null;
}

/**
 * Search NSE/BSE equities by name or ticker, caching each hit as an Instrument.
 * This is the ONLY way a symbol enters the app, which is what guarantees every
 * stored symbol is one upstream actually recognises.
 */
export async function searchInstruments(query: string): Promise<ParsedSearchHit[]> {
  if (!env.stocks.enabled) throw new HttpError(400, "Stock tracking isn't configured", "STOCKS_DISABLED");
  const q = query.trim();
  if (q.length < 2) return [];

  const hits =
    env.stocks.provider === "stub"
      ? [
          {
            symbol: `${q.toUpperCase()}.NS`,
            ticker: q.toUpperCase(),
            exchange: "NSE" as Exchange,
            shortName: q.toUpperCase(),
            longName: `${q.toUpperCase()} Test Instrument`,
            sector: "Test",
            industry: "Test",
          },
        ]
      : parseSearchHits(await getJson(`${SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`));

  // Cache what we learned so a later add doesn't need to search again.
  for (const hit of hits) {
    await Instrument.updateOne(
      { symbol: hit.symbol },
      { $set: { ...hit, currency: "INR", lastSeenAt: new Date() } },
      { upsert: true }
    );
  }
  return hits;
}

/**
 * Resolve a symbol to a stored Instrument, verifying upstream still quotes it in
 * INR before it can be held. Throws rather than returning null: adding a lot for
 * an instrument we cannot price would put an unvaluable position into net worth.
 */
export async function ensureInstrument(symbol: string) {
  const exchange = exchangeFromSymbol(symbol);
  if (!exchange) throw new HttpError(400, "Only NSE and BSE stocks can be tracked", "STOCK_EXCHANGE_UNSUPPORTED");

  // Cache first, and deliberately before the feature-flag check: an instrument we
  // already know stays usable even with the live feed turned off, so existing
  // positions keep valuing at their last stored close instead of erroring.
  const existing = await Instrument.findOne({ symbol });
  if (existing) return existing;

  if (!env.stocks.enabled) throw new HttpError(400, "Stock tracking isn't configured", "STOCKS_DISABLED");

  const quote = await fetchQuote(symbol);
  // parseChartQuote returns null for a non-INR instrument, so this covers both
  // "unknown symbol" and "quoted in another currency".
  if (!quote) throw new HttpError(400, "That symbol could not be priced in INR", "STOCK_SYMBOL_UNPRICEABLE");

  return Instrument.create({
    symbol,
    ticker: symbol.replace(/\.(NS|BO)$/, ""),
    exchange,
    shortName: quote.shortName,
    longName: quote.longName,
    currency: "INR",
    lastSeenAt: new Date(),
  });
}

// ---- Daily snapshots ----

/** Upsert today's snapshot for one symbol. Returns false when nothing was stored. */
async function captureSymbol(symbol: string, date: string): Promise<boolean> {
  const quote = await fetchQuote(symbol);
  if (!quote) return false;

  const prevClose = quote.prevClose || 0;
  const change = prevClose ? quote.close - prevClose : 0;
  const changePct = prevClose ? Math.round((change / prevClose) * 100 * 100) / 100 : 0;

  await StockPrice.findOneAndUpdate(
    { symbol, date },
    {
      $set: {
        currency: "INR",
        close: quote.close,
        prevClose,
        change,
        changePct,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        week52High: quote.week52High,
        week52Low: quote.week52Low,
        volume: quote.volume,
        source: SOURCE,
        fetchedAt: new Date(),
        stale: false,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return true;
}

/**
 * Capture today's price for one symbol right now, best-effort. Called when a lot
 * is first created so a newly-added position shows a live price immediately
 * rather than sitting at cost until the next scheduled run. Never throws — a
 * failure just leaves the position valued at cost.
 */
export async function captureSymbolNow(symbol: string): Promise<void> {
  if (!env.stocks.enabled) return;
  try {
    await captureSymbol(symbol, istDate());
  } catch (e) {
    console.error(`[stocks] initial capture failed for ${symbol}`, e);
  }
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      await worker(next);
    }
  });
  await Promise.all(runners);
}

/**
 * Every symbol at least one user still holds — the exact refresh set. Bounding
 * the fan-out by what is actually owned (rather than by the user count, or by
 * every listed instrument) is what keeps an un-batchable endpoint affordable.
 */
export async function heldSymbols(): Promise<string[]> {
  return (await StockLot.distinct("symbol", { qtyRemaining: { $gt: 0 } })) as string[];
}

/**
 * Refresh today's price for every held symbol, bounded by the concurrency cap.
 * A symbol that fails is left with whatever is already stored — the portfolio
 * then values it at its last known close, flagged stale, rather than at zero.
 * Idempotent: safe to call on boot and on every cron tick.
 */
export async function refreshStockPrices(): Promise<{ refreshed: number; failed: number }> {
  if (!env.stocks.enabled) return { refreshed: 0, failed: 0 };

  const symbols = await heldSymbols();
  if (!symbols.length) return { refreshed: 0, failed: 0 };

  const date = istDate();
  let refreshed = 0;
  let failed = 0;

  await mapLimit(symbols, env.stocks.maxConcurrentFetches, async (symbol) => {
    try {
      if (await captureSymbol(symbol, date)) refreshed++;
      else failed++;
    } catch (e) {
      failed++;
      console.error(`[stocks] capture failed for ${symbol}`, e);
    }
  });

  if (failed) {
    console.error(`[stocks] ${failed}/${symbols.length} symbol(s) failed to refresh; last close stands`);
  }
  return { refreshed, failed };
}

// Floor between user-triggered refreshes, so repeated taps can't hammer upstream.
// The scheduled runs keep their own cadence regardless.
const ON_DEMAND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * User-triggered refresh. Throws 429 with the remaining wait when called too
 * soon after the last fetch (scheduled or on-demand).
 */
export async function refreshStockPricesOnDemand(): Promise<{ refreshed: number; failed: number }> {
  if (!env.stocks.enabled) throw new HttpError(400, "Stock tracking isn't configured", "STOCKS_DISABLED");

  const newest = await StockPrice.findOne().sort({ fetchedAt: -1 }).lean();
  const elapsed = Date.now() - (newest?.fetchedAt ? new Date(newest.fetchedAt).getTime() : 0);
  if (elapsed < ON_DEMAND_COOLDOWN_MS) {
    const waitMin = Math.ceil((ON_DEMAND_COOLDOWN_MS - elapsed) / 60_000);
    throw new HttpError(
      429,
      `Prices were just refreshed. Try again in ${waitMin} minute${waitMin === 1 ? "" : "s"}.`,
      "STOCK_REFRESH_COOLDOWN",
      { minutes: waitMin }
    );
  }

  return refreshStockPrices();
}

export interface LatestPrice {
  symbol: string;
  close: number;
  change: number;
  changePct: number;
  week52High: number;
  week52Low: number;
  date: string;
  /** True when this is a carried-forward close (weekend, holiday, failed fetch). */
  stale: boolean;
  fetchedAt: Date | null;
}

/**
 * Newest stored price for each symbol, keyed by symbol. A price from an earlier
 * day is returned marked `stale` rather than withheld — the portfolio must still
 * value itself over a weekend, it just has to say the price is not live.
 */
export async function getLatestPrices(symbols: string[]): Promise<Map<string, LatestPrice>> {
  const map = new Map<string, LatestPrice>();
  if (!symbols.length) return map;

  const today = istDate();
  const rows = await StockPrice.aggregate<{ _id: string; doc: any }>([
    { $match: { symbol: { $in: symbols } } },
    { $sort: { date: -1 } },
    { $group: { _id: "$symbol", doc: { $first: "$$ROOT" } } },
  ]);

  for (const row of rows) {
    const d = row.doc;
    map.set(row._id, {
      symbol: row._id,
      close: d.close,
      change: d.change ?? 0,
      changePct: d.changePct ?? 0,
      week52High: d.week52High ?? 0,
      week52Low: d.week52Low ?? 0,
      date: d.date,
      stale: Boolean(d.stale) || d.date !== today,
      fetchedAt: d.fetchedAt ?? null,
    });
  }
  return map;
}

/** Daily closes for one symbol, oldest → newest, capped to `days` points. */
export async function getStockHistory(symbol: string, days: number) {
  const rows = await StockPrice.find({ symbol }).sort({ date: -1 }).limit(days).lean();
  return rows.reverse();
}
