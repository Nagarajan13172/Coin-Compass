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
import { refreshMetalPrices } from "./services/metalPriceService";
import { sendDueReports } from "./services/reportEmailService";

async function bootstrap() {
  await connectDB();

  const app = express();
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

  // Process recurring transactions on boot, then hourly.
  await processDueRecurring().catch((e) => console.error("[recurring] boot run failed", e));
  cron.schedule("0 * * * *", () => {
    processDueRecurring().catch((e) => console.error("[recurring] scheduled run failed", e));
  });

  // Refresh gold/silver rates on boot (backfills today if missing), then daily
  // at 06:30 IST. No-op when GOLD_API_KEY isn't configured.
  await refreshMetalPrices().catch((e) => console.error("[metals] boot run failed", e));
  cron.schedule(
    "30 6 * * *",
    () => {
      refreshMetalPrices().catch((e) => console.error("[metals] scheduled run failed", e));
    },
    { timezone: "Asia/Kolkata" }
  );

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
