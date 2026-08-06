import { connectDB } from "../config/db";
import { StockLot } from "../models/StockLot";
import { backfillStockHistory } from "../services/stockPriceService";

/**
 * Pull daily closes for every symbol anyone holds, so positions added before the
 * automatic backfill existed still get a chart.
 *
 * Insert-only, so a live capture is never overwritten and re-running is a no-op.
 * Pass a range as the first argument (default 1y): 6mo, 1y, 2y, 5y, max.
 *
 *   npm --prefix server run backfill:stocks
 *   npm --prefix server run backfill:stocks 5y
 */
async function main() {
  const range = process.argv[2] ?? "1y";
  await connectDB();

  const symbols = (await StockLot.distinct("symbol", { qtyRemaining: { $gt: 0 } })) as string[];
  if (!symbols.length) {
    console.log("[stocks] nothing held — no history to backfill");
    return;
  }

  console.log(`[stocks] backfilling ${range} of history for ${symbols.length} symbol(s)…`);
  let total = 0;
  for (const symbol of symbols) {
    // `force` because these symbols already have at least today's capture, which
    // is exactly what the automatic guard skips on.
    const inserted = await backfillStockHistory(symbol, range, { force: true });
    console.log(`  ${symbol}: ${inserted} day(s)`);
    total += inserted;
  }
  console.log(`[stocks] done — ${total} day(s) stored`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
