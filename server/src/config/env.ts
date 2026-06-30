import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017/money-tracker",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
};
