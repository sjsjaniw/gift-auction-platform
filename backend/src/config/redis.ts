import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  // 👇 ВАЖНО: Принудительно используем IPv4.
  // Это спасает от багов на Node 17+ и некоторых Windows/Mac настройках.
  family: 4,
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.log("✅ Redis Client Connected");
});
