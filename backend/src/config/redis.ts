import Redis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  family: 4,
});

redisClient.on("error", (err) => {
  logger.error("Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.info("Redis Client Connected");
});
