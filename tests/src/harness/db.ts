import { inject } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";

/**
 * Direct read access to the test database — for *integrity* assertions the API
 * can hide (orphaned references, dangling links). Invariant tests use this to
 * prove there are no lingering documents after a delete, independent of what the
 * API chooses to return.
 */
let client: MongoClient | null = null;

async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(inject("mongoUri"));
    await client.connect();
  }
  return client.db();
}

/** Count documents in `collection` whose `field` references the given id (as an ObjectId). */
export async function refCount(collection: string, field: string, id: string): Promise<number> {
  const db = await getDb();
  return db.collection(collection).countDocuments({ [field]: new ObjectId(id) });
}

/** Count documents matching an arbitrary filter. */
export async function docCount(collection: string, filter: Record<string, unknown>): Promise<number> {
  const db = await getDb();
  return db.collection(collection).countDocuments(filter);
}

/**
 * Insert a document directly — used to seed state the API doesn't expose a
 * create endpoint for (e.g. system-generated notifications). Any `user` field is
 * coerced to an ObjectId so it matches server-side ownership queries. Returns the
 * inserted id as a string.
 */
export async function insertDoc(
  collection: string,
  doc: Record<string, unknown>
): Promise<string> {
  const db = await getDb();
  const toInsert = { ...doc };
  if (typeof toInsert.user === "string") toInsert.user = new ObjectId(toInsert.user);
  const res = await db.collection(collection).insertOne(toInsert);
  return String(res.insertedId);
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
