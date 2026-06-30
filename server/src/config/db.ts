import mongoose from "mongoose";
import { env } from "./env";

export async function connectDB(): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  const conn = await mongoose.connect(env.mongoUri);
  // eslint-disable-next-line no-console
  console.log(`✓ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}
