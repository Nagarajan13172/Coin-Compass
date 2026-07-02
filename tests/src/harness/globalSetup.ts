import type { GlobalSetupContext } from "vitest/node";
import { startMongo } from "./mongo";
import { startServer } from "./server";
import { API_URL, OUTBOX_FILE } from "./config";

/**
 * Boot one shared stack for the whole API test run: an ephemeral Mongo and the
 * real server wired to it. Publishes connection details to the specs via
 * provide(), and tears everything down afterwards.
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const mongo = await startMongo();
  const server = await startServer(mongo.uri, OUTBOX_FILE);

  provide("apiUrl", API_URL);
  provide("mongoUri", mongo.uri);
  provide("outboxFile", OUTBOX_FILE);

  return async () => {
    await server.stop();
    await mongo.stop();
  };
}
