import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import cron from "node-cron";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import apiRouter from "./routes/index";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { processDueRecurring } from "./services/recurringService";
import { refreshMetalPrices } from "./services/metalPriceService";

async function bootstrap() {
  await connectDB();

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  if (!env.isProd) app.use(morgan("dev"));

  app.use("/api", apiRouter);
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
