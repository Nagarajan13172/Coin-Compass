import { startMongo, type MongoHandle } from "../harness/mongo";
import { startServer, type ServerHandle } from "../harness/server";
import fs from "node:fs";
import { MONGO_URI_FILE, OUTBOX_FILE } from "../harness/config";

// Stash the running stack so global-teardown (same process) can stop it.
declare global {
  // eslint-disable-next-line no-var
  var __E2E_STACK__: { mongo: MongoHandle; server: ServerHandle } | undefined;
}

/**
 * Boot the ephemeral Mongo + the real server for the E2E run. The client dev
 * server is started separately by Playwright's `webServer`. CLIENT_URL is set to
 * the app origin so the server's CORS accepts it.
 */
export default async function globalSetup() {
  const mongo = await startMongo();
  const server = await startServer(mongo.uri, OUTBOX_FILE, {
    CLIENT_URL: "http://127.0.0.1:5173",
    APP_URL: "http://127.0.0.1:5173",
    // Off by default so the suite never scrapes the live GRT site. A run that
    // needs the Gold page can switch it on and seed rates itself.
    ...(process.env.METALS_ENABLED ? { METALS_ENABLED: process.env.METALS_ENABLED } : {}),
  });
  fs.writeFileSync(MONGO_URI_FILE, mongo.uri, "utf8");
  globalThis.__E2E_STACK__ = { mongo, server };
}
