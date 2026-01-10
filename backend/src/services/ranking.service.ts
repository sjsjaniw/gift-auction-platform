import { redisClient } from "../config/redis";

export class RankingService {
  // Ключ для хранения ZSET (Очередь участников)
  // Используем :leaderboard, чтобы не путаться со старыми ключами
  private static getKey(auctionId: string) {
    return `auction:${auctionId}:leaderboard`;
  }

  /**
   * Добавить или обновить ставку.
   * Сложность: O(log N)
   */
  static async addBid(auctionId: string, userId: string, amount: number) {
    const key = this.getKey(auctionId);
    await redisClient.zadd(key, amount, userId);
  }

  /**
   * Получить победителей (Топ-N участников).
   * Используется в конце раунда, чтобы узнать, кому выдать подарки.
   */
  static async getWinners(auctionId: string, limit: number): Promise<string[]> {
    const key = this.getKey(auctionId);
    // ZREVRANGE: сортировка от большего к меньшему, берем от 0 до limit-1
    return redisClient.zrevrange(key, 0, limit - 1);
  }

  /**
   * Получить просто топ участников (алиас для getWinners, используется для UI)
   */
  static async getTopBidders(
    auctionId: string,
    limit: number,
  ): Promise<string[]> {
    return this.getWinners(auctionId, limit);
  }

  /**
   * Удалить победителей из очереди.
   * Ключевая механика: победители уходят, проигравшие сдвигаются вверх.
   */
  static async removeWinners(auctionId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const key = this.getKey(auctionId);
    await redisClient.zrem(key, ...userIds);
  }

  /**
   * Получить ВСЕХ участников.
   * Используется в самом конце аукциона для возврата денег (Refund).
   */
  static async getAllParticipants(auctionId: string): Promise<string[]> {
    const key = this.getKey(auctionId);
    // ZRANGE 0 -1 вернет всех членов множества
    return redisClient.zrange(key, 0, -1);
  }

  /**
   * РАСЧЕТ МИНИМАЛЬНОЙ ЦЕНЫ (Dynamic Price Logic).
   *
   * Если мест 50, а участников 20 -> цена = startPrice.
   * Если участников 100 -> цена = (ставка 50-го человека) + 1.
   */
  static async getMinEntryPrice(
    auctionId: string,
    placesCount: number,
    defaultPrice: number,
  ): Promise<number> {
    const key = this.getKey(auctionId);

    // 1. Сколько всего людей
    const totalParticipants = await redisClient.zcard(key);

    // 2. Если людей меньше, чем подарков — вход по минималке
    if (totalParticipants < placesCount) {
      return defaultPrice;
    }

    // 3. Если мест не хватает, находим ставку того, кто сейчас на грани вылета
    // Индекс в Redis с 0, поэтому берем (placesCount - 1)
    const result = await redisClient.zrevrange(
      key,
      placesCount - 1,
      placesCount - 1,
      "WITHSCORES",
    );

    // result вернет массив ["userId", "score"]
    if (result.length < 2) return defaultPrice;

    const lastWinnerScore = Number(result[1]);

    // Правило: нужно перебить ставку последнего проходящего хотя бы на 1
    return lastWinnerScore + 1;
  }

  /**
   * Проверка для Anti-Sniping.
   * Возвращает true, если юзер сейчас входит в Топ-N (является потенциальным победителем).
   */
  static async isRankWithin(
    auctionId: string,
    userId: string,
    limit: number,
  ): Promise<boolean> {
    const key = this.getKey(auctionId);

    // Получаем ранг (0 - это первое место)
    const rank = await redisClient.zrevrank(key, userId);

    // Если юзера нет (null) или он ниже лимита — false
    if (rank === null) return false;

    return rank < limit;
  }

  /**
   * Получить позицию конкретного юзера (для UI: "Вы на 15 месте").
   */
  static async getUserPosition(
    auctionId: string,
    userId: string,
  ): Promise<number | null> {
    const key = this.getKey(auctionId);
    const rank = await redisClient.zrevrank(key, userId);
    return rank !== null ? rank + 1 : null;
  }

  /**
   * Получить общее кол-во участников (для UI).
   */
  static async getParticipantsCount(auctionId: string): Promise<number> {
    const key = this.getKey(auctionId);
    return redisClient.zcard(key);
  }

  /**
   * Полная очистка данных аукциона (после завершения).
   */
  static async clearAuction(auctionId: string) {
    const key = this.getKey(auctionId);
    await redisClient.del(key);
  }
}
