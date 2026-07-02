import { MongoMemoryServer } from "mongodb-memory-server";

export interface MongoHandle {
  uri: string;
  stop: () => Promise<void>;
}

/**
 * Start a throwaway MongoDB for the test run. Uses an in-memory mongod by
 * default; if TEST_MONGO_URI is set (e.g. a docker/local Mongo, handy when the
 * mongod binary download is blocked) we use that instead and leave it running.
 */
export async function startMongo(): Promise<MongoHandle> {
  const override = process.env.TEST_MONGO_URI;
  if (override) {
    return { uri: override, stop: async () => {} };
  }
  const mem = await MongoMemoryServer.create();
  return {
    uri: mem.getUri("coincompass_test"),
    stop: () => mem.stop(),
  };
}
