import { redisClient } from "../config/redis";

export class RankingService {
  private static getKey(auctionId: string) {
    return `auction:${auctionId}:leaderboard`;
  }

  static async addBid(auctionId: string, userId: string, amount: number) {
    const key = this.getKey(auctionId);
    await redisClient.zadd(key, amount, userId);
  }

  static async getWinners(auctionId: string, limit: number): Promise<string[]> {
    const key = this.getKey(auctionId);
    return redisClient.zrevrange(key, 0, limit - 1);
  }

  static async getTopBidders(
    auctionId: string,
    limit: number,
  ): Promise<string[]> {
    return this.getWinners(auctionId, limit);
  }

  static async removeWinners(auctionId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const key = this.getKey(auctionId);
    await redisClient.zrem(key, ...userIds);
  }

  static async getAllParticipants(auctionId: string): Promise<string[]> {
    const key = this.getKey(auctionId);
    return redisClient.zrange(key, 0, -1);
  }

  static async getMinEntryPrice(
    auctionId: string,
    placesCount: number,
    defaultPrice: number,
  ): Promise<number> {
    const key = this.getKey(auctionId);

    const totalParticipants = await redisClient.zcard(key);

    if (totalParticipants < placesCount) {
      return defaultPrice;
    }

    const result = await redisClient.zrevrange(
      key,
      placesCount - 1,
      placesCount - 1,
      "WITHSCORES",
    );

    if (result.length < 2) return defaultPrice;

    const lastWinnerScore = Number(result[1]);

    return lastWinnerScore + 1;
  }

  static async isRankWithin(
    auctionId: string,
    userId: string,
    limit: number,
  ): Promise<boolean> {
    const key = this.getKey(auctionId);
    const rank = await redisClient.zrevrank(key, userId);

    if (rank === null) return false;

    return rank < limit;
  }

  static async getUserPosition(
    auctionId: string,
    userId: string,
  ): Promise<number | null> {
    const key = this.getKey(auctionId);
    const rank = await redisClient.zrevrank(key, userId);
    return rank !== null ? rank + 1 : null;
  }

  static async getParticipantsCount(auctionId: string): Promise<number> {
    const key = this.getKey(auctionId);
    return redisClient.zcard(key);
  }

  static async clearAuction(auctionId: string) {
    const key = this.getKey(auctionId);
    await redisClient.del(key);
  }
}
