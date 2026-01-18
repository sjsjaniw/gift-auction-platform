import morgan from "morgan";
import { logger } from "../utils/logger";

const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

const format =
  process.env.NODE_ENV === "production"
    ? ":remote-addr - :method :url :status :res[content-length] - :response-time ms"
    : "dev";

export const httpLogger = morgan(format, { stream });
