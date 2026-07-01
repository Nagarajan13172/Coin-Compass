import morgan from "morgan";
import { env } from "../config/env";

const devFormat = ":method :url :status :response-time ms - :res[content-length]";
const prodFormat = ":remote-addr :method :url :status :response-time ms - :res[content-length]";

export const requestLogger = morgan(env.isProd ? prodFormat : devFormat, {
  skip: (req) => req.url === "/api/health",
});
