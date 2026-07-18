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
import { refreshMetalPrices, isTodayCaptured } from "./services/metalPriceService";
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
  // missing), then twice a day at 06:30 and 13:30 IST. The midday run is a cheap
  // retry — refreshMetalPrices is idempotent, so it only does work if the morning
  // scrape failed, which keeps a single transient GRT/network blip from losing a
  // whole (unrecoverable) day. No-op when METALS_ENABLED=false.
  const refreshMetalsAndAlert = async (label: string): Promise<void> => {
    try {
      await refreshMetalPrices();
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
  for (const time of ["30 6 * * *", "30 13 * * *"]) {
    cron.schedule(time, () => void refreshMetalsAndAlert(`cron ${time}`), { timezone: "Asia/Kolkata" });
  }

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
