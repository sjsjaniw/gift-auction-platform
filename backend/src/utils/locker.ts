import Redlock from "redlock";
import { redisClient } from "../config/redis";

export const redlock = new Redlock([redisClient as any], {
  driftFactor: 0.01,
  retryCount: 10,
  retryDelay: 200,
  retryJitter: 200,
});
