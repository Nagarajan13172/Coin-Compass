import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cron from "node-cron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import apiRouter from "./routes/index";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { processDueRecurring } from "./services/recurringService";
import { runNotificationSweep } from "./services/notificationService";
import { purgeExpiredDeletions } from "./services/trashService";
import { refreshMetalPrices, fillMetalGaps, isTodayCaptured } from "./services/metalPriceService";
import { refreshStockPrices, syncAllSplits } from "./services/stockPriceService";
import { sendDueReports } from "./services/reportEmailService";

async function bootstrap() {
  await connectDB();

  const app = express();
  // Behind Traefik: trust its X-Forwarded-* headers so req.protocol/req.hostname
  // reflect the public HTTPS origin instead of the plain-HTTP hop from the proxy.
  app.set("trust proxy", 1);
  // CSP is disabled so the bundled SPA can load its hashed assets and external
  // images (e.g. Google profile avatars). Add a real policy before a public deploy.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);

  app.use("/api", apiRouter);

  // Serve the built frontend when it's present. Put the contents of the client
  // build (everything inside client/dist/) into server/public/ — so that
  // server/public/index.html exists. Any non-API GET falls back to index.html
  // so client-side routes (e.g. /transactions) work on a hard refresh.
  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
  if (fs.existsSync(path.join(clientDir, "index.html"))) {
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDir, "index.html"));
    });
    // eslint-disable-next-line no-console
    console.log(`✓ Serving frontend from ${clientDir}`);
  }

  app.use(notFound);
  app.use(errorHandler);

  // Process recurring transactions on boot, then hourly. Each cron post raises an
  // in-app notification (see recurringService) so users never miss an auto-post.
  await processDueRecurring().catch((e) => console.error("[recurring] boot run failed", e));
  cron.schedule("0 * * * *", () => {
    processDueRecurring().catch((e) => console.error("[recurring] scheduled run failed", e));
  });

  // Reminder/alert sweep (recurring due-soon/overdue, budget exceeded, low balance).
  // On boot (right after the recurring run, so due-soon reflects freshly-advanced
  // schedules), then daily at 07:15 IST. Idempotent via dedupe keys.
  await runNotificationSweep().catch((e) => console.error("[notify] boot sweep failed", e));
  cron.schedule(
    "15 7 * * *",
    () => {
      runNotificationSweep().catch((e) => console.error("[notify] scheduled sweep failed", e));
    },
    { timezone: "Asia/Kolkata" }
  );

  // Refresh gold/silver rates by scraping GRT: on boot (backfills today if
  // missing), then at 11:00 and 15:00 IST. 11:00 is deliberately late enough that
  // GRT has published the new day's rate — it keeps serving the previous day's
  // until then, so the old 06:30 scrape stored a stale value, and because the
  // first GRT capture of a day wins (refreshMetalPrices is idempotent) that stale
  // rate stayed locked in all day. Both runs therefore force a re-scrape so the
  // later one wins: 11:00 overrides anything an early boot run stored, and 15:00
  // picks up an intraday revision. Forcing is safe — a failed scrape leaves the
  // existing snapshot in place — so either run on its own still lands the day, and
  // one transient GRT/network blip can't lose a whole (unrecoverable) day.
  // No-op when METALS_ENABLED=false.
  const refreshMetalsAndAlert = async (label: string, force = false): Promise<void> => {
    try {
      await refreshMetalPrices({ force });
      // Now that today's live rate is captured, recover any days missed while the
      // server was offline (a common local-dev case) by interpolating between the
      // stored snapshots — GRT has no historical endpoint, so this is the only way
      // to keep the chart continuous instead of drawing a straight jump across the
      // gap. liveOnly (default) bridges only between real GRT days, leaving the
      // weekday-only estimated history untouched. Idempotent, so it's safe here.
      const filled = await fillMetalGaps();
      if (filled) {
        console.log(`[metals] ${label} run: recovered ${filled} missed day(s) by interpolation`);
      }
      // GRT publishes only today's rate, so a fully-missed day can't be re-fetched
      // — surface it loudly so it can be recovered via the on-demand refresh.
      if (!(await isTodayCaptured())) {
        console.error(
          `[metals] ⚠ today's rate is still missing after the ${label} run — GRT scrape is failing. ` +
            `Use the on-demand refresh or check grtjewels.com.`
        );
      }
    } catch (e) {
      console.error(`[metals] ${label} run failed`, e);
    }
  };
  await refreshMetalsAndAlert("boot");
  for (const time of ["0 11 * * *", "0 15 * * *"]) {
    cron.schedule(time, () => void refreshMetalsAndAlert(`cron ${time}`, true), {
      timezone: "Asia/Kolkata",
    });
  }

  // Refresh equity prices for every symbol someone holds: on boot, then every 15
  // minutes through the NSE session (09:15–15:30 IST, Mon–Fri) and once at 15:45
  // to capture the settled close. Unlike the metals scrape there is no urgency to
  // any single run — the upstream chart endpoint serves history, so a missed day
  // is recoverable — but a symbol that fails simply keeps its last stored close,
  // flagged stale, so the portfolio never values a position at zero.
  // No-op when STOCKS_ENABLED=false or nothing is held.
  const refreshStocks = async (label: string): Promise<void> => {
    try {
      const { refreshed, failed } = await refreshStockPrices();
      if (refreshed || failed) {
        console.log(`[stocks] ${label} run: ${refreshed} refreshed, ${failed} failed`);
      }
    } catch (e) {
      console.error(`[stocks] ${label} run failed`, e);
    }
  };
  await refreshStocks("boot");
  for (const time of ["*/15 9-15 * * 1-5", "45 15 * * 1-5"]) {
    cron.schedule(time, () => void refreshStocks(`cron ${time}`), { timezone: "Asia/Kolkata" });
  }

  // Record share splits and bonus issues daily, after the close. Recording is not
  // applying: an unapplied split shows the user a sudden fake loss (the market
  // price adjusts the instant it takes effect but stored lots do not), and the
  // Stocks page offers it for confirmation. Multiplying someone's share count
  // without asking would be worse than showing them a number they can question.
  const syncSplits = async (label: string): Promise<void> => {
    try {
      const found = await syncAllSplits();
      if (found) console.log(`[stocks] ${label}: recorded ${found} new corporate action(s)`);
    } catch (e) {
      console.error(`[stocks] ${label} split sync failed`, e);
    }
  };
  await syncSplits("boot");
  cron.schedule("30 16 * * 1-5", () => void syncSplits("cron"), { timezone: "Asia/Kolkata" });

  // Email summary reports on the 1st (last month) and 15th (month-to-date) at 08:00
  // IST. Also run on boot to catch a run missed while the server was down; the
  // per-user daily key makes both paths idempotent (no double sends).
  sendDueReports().catch((e) => console.error("[report-email] boot run failed", e));
  cron.schedule(
    "0 8 * * *",
    () => {
      sendDueReports().catch((e) => console.error("[report-email] scheduled run failed", e));
    },
    { timezone: "Asia/Kolkata" }
  );

  // Purge expired "Recently deleted" transactions on boot, then daily at 03:30 IST.
  // Deleted rows are side-effect-free, so purging is a plain hard delete.
  await purgeExpiredDeletions().catch((e) => console.error("[trash] boot purge failed", e));
  cron.schedule(
    "30 3 * * *",
    () => {
      purgeExpiredDeletions().catch((e) => console.error("[trash] scheduled purge failed", e));
    },
    { timezone: "Asia/Kolkata" }
  );

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`✓ API listening on http://localhost:${env.port}/api`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
