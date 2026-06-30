import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cron from "node-cron";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import apiRouter from "./routes/index";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { processDueRecurring } from "./services/recurringService";

async function bootstrap() {
  await connectDB();

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
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
