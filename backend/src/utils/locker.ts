import Redlock from "redlock";
import { redisClient } from "../config/redis";

// TS ругается, что ioredis не совпадает с интерфейсом внутри redlock.
// Мы знаем, что он совпадает, поэтому делаем "as any" (грязный хак, но рабочий).
export const redlock = new Redlock([redisClient as any], {
  driftFactor: 0.01,
  retryCount: 10,
  retryDelay: 200,
  retryJitter: 200,
});
