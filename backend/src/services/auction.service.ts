import mongoose, { Types } from "mongoose";
import { redlock } from "../utils/locker";
import { User } from "../models/user.model";
import { Auction } from "../models/auction.model";
import { Bid } from "../models/bid.model";
import { Gift } from "../models/gift.model";
import { Transaction } from "../models/transaction.model";
import { RankingService } from "./ranking.service";
import { redisClient } from "../config/redis";
import { CreateAuctionDto } from "../schemas/auction.schema";
import { AnyBulkWriteOperation } from "mongoose"; // 👈 Тип операции bulkWrite
import { IUser } from "../models/user.model";
import { IBid } from "../models/bid.model";
import { ITransaction } from "../models/transaction.model";

// 🔥 ФИКС ТИПОВ REDLOCK
// Мы вручную описываем интерфейс лока с методом release.
// Это заставляет TypeScript игнорировать старые определения типов.
interface ExecutionLock {
  release(): Promise<void>;
}

export class AuctionService {
  /**
   * 1. Создание аукциона
   */
  static async createAuction(data: CreateAuctionDto) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 🔥 ФИКС ОШИБКИ TYPE NEVER
      // Mongoose.create очень капризный к типам DTO vs Schema.
      // Мы используем 'as any', чтобы сказать TS: "Поверь, данные подходят под схему".
      // Это безопасно, так как мы уже провалидировали data через Zod в контроллере.
      const auctions = await Auction.create([data as any], { session });
      const auction = auctions[0];

      if (!auction) throw new Error("Failed to create auction");

      const gifts = [];
      for (let i = 1; i <= auction.totalQuantity; i++) {
        gifts.push({
          auctionId: auction._id,
          serialNumber: i,
          status: "AVAILABLE",
          ownerId: null,
          assetName: data.assetName,
          assetSymbol: data.assetSymbol,
          assetColor: data.assetColor,
        });
      }

      await Gift.insertMany(gifts, { session });

      await session.commitTransaction();
      return auction;
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  /**
   * 2. Получить список активных
   */
  static async getActiveAuctions() {
    return Auction.find(
      { status: { $in: ["ACTIVE", "PENDING"] } },
      "title status startTime currentRoundNumber totalQuantity rounds assetSymbol assetColor",
    ).sort({ createdAt: -1 });
  }

  /**
   * 3. Сделать ставку
   */
  static async placeBid(
    userId: string,
    auctionId: string,
    totalAmount: number,
  ) {
    const lockKey = `lock:bid:${auctionId}:${userId}`;

    // 👇 Используем наш ручной интерфейс
    let lock: ExecutionLock | null = null;

    try {
      // 👇 Принудительно приводим тип через 'as unknown', чтобы TS не спорил
      lock = (await redlock.acquire(
        [lockKey],
        4000,
      )) as unknown as ExecutionLock;
    } catch (e) {
      throw new Error("Too fast! Please wait a moment.");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const userObjectId = new Types.ObjectId(userId);
      const auctionObjectId = new Types.ObjectId(auctionId);

      const user = await User.findById(userObjectId).session(session);
      const auction = await Auction.findById(auctionObjectId).session(session);

      if (!user) throw new Error("User not found");
      if (!auction || auction.status !== "ACTIVE")
        throw new Error("Auction not active");

      const existingWin = await Bid.findOne({
        auctionId: auctionObjectId,
        userId: userObjectId,
        status: "WON", // <--- Если есть хоть одна ставка WON
      }).session(session);

      if (existingWin) {
        throw new Error("You have already won a gift in this auction!");
      }

      const currentRound = auction.rounds.find(
        (r) => r.roundNumber === auction.currentRoundNumber,
      );
      if (!currentRound) throw new Error("Round config error");
      if (new Date() > currentRound.endTime) throw new Error("Round finished");

      const minPrice = await RankingService.getMinEntryPrice(
        auctionId,
        currentRound.giftCount,
        auction.startPrice,
      );

      if (totalAmount < minPrice)
        throw new Error(`Bid too low! Min: ${minPrice}`);

      let bid = await Bid.findOne({
        auctionId: auctionObjectId,
        userId: userObjectId,
        status: "ACTIVE",
      }).session(session);

      const oldAmount = bid ? bid.amount : 0;
      const diff = totalAmount - oldAmount;

      if (diff <= 0) throw new Error("New bid must be higher");
      if (user.balance < diff) throw new Error("Insufficient balance");

      user.balance -= diff;
      user.frozenBalance += diff;
      await user.save({ session });

      await Transaction.create(
        [
          {
            userId: userObjectId,
            auctionId: auctionObjectId,
            amount: -diff,
            type: "BID_FREEZE",
            balanceAfter: user.balance,
            frozenAfter: user.frozenBalance,
            reason: bid ? "Bid update" : "New bid",
          },
        ],
        { session },
      );

      if (bid) {
        bid.amount = totalAmount;
        await bid.save({ session });
      } else {
        await Bid.create(
          [
            {
              auctionId: auctionObjectId,
              userId: userObjectId,
              amount: totalAmount,
              status: "ACTIVE",
            },
          ],
          { session },
        );
      }

      await RankingService.addBid(auctionId, userId, totalAmount);

      const isWinner = await RankingService.isRankWithin(
        auctionId,
        userId,
        currentRound.giftCount,
      );

      if (isWinner) {
        const timeLeft = currentRound.endTime.getTime() - new Date().getTime();
        if (timeLeft < 30000) {
          currentRound.endTime = new Date(
            currentRound.endTime.getTime() + 30000,
          );
          auction.markModified("rounds");
          await auction.save({ session });
        }
      }

      await session.commitTransaction();

      const rank = await RankingService.getUserPosition(auctionId, userId);

      return {
        success: true,
        rank,
        totalAmount,
        balance: user.balance,
        frozen: user.frozenBalance,
      };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
      // 👇 Теперь ошибки нет, так как ExecutionLock имеет метод release
      if (lock) await lock.release();
    }
  }

  /**
   * 4. Обработка окончания раунда
   */
  static async processRoundEnd(auctionId: string) {
    const lockKey = `lock:process:${auctionId}`;

    // 👇 Используем интерфейс и здесь
    let lock: ExecutionLock | null = null;

    try {
      lock = (await redlock.acquire(
        [lockKey],
        10000,
      )) as unknown as ExecutionLock;
    } catch {
      return;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const auction = await Auction.findById(auctionId).session(session);
      if (!auction || auction.status !== "ACTIVE") {
        await session.abortTransaction();
        return;
      }

      const currentRound = auction.rounds.find(
        (r) => r.roundNumber === auction.currentRoundNumber,
      );

      if (
        !currentRound ||
        currentRound.isProcessed ||
        new Date() < currentRound.endTime
      ) {
        await session.abortTransaction();
        return;
      }

      console.log(`🔄 Processing Round ${auction.currentRoundNumber}...`);

      // === ЭТАП 1: ПОБЕДИТЕЛИ ===
      const winnerIds = await RankingService.getWinners(
        auctionId,
        currentRound.giftCount,
      );

      if (winnerIds.length > 0) {
        const gifts = await Gift.find({
          auctionId: new Types.ObjectId(auctionId),
          status: "AVAILABLE",
        })
          .sort({ serialNumber: 1 })
          .limit(winnerIds.length)
          .session(session);

        for (let i = 0; i < winnerIds.length; i++) {
          const userIdStr = winnerIds[i];
          const userId = new Types.ObjectId(userIdStr);
          const gift = gifts[i];

          if (!gift) break;

          const bid = await Bid.findOne({
            auctionId: auction._id,
            userId: userId,
            status: "ACTIVE",
          }).session(session);

          if (!bid) {
            console.error(`Missing bid for winner ${userIdStr}`);
            continue;
          }

          const user = await User.findById(userId).session(session);
          if (user) {
            user.frozenBalance -= bid.amount;
            await user.save({ session });

            await Transaction.create(
              [
                {
                  userId: userId,
                  auctionId: auction._id,
                  amount: 0,
                  type: "BID_PAYMENT",
                  balanceAfter: user.balance,
                  frozenAfter: user.frozenBalance,
                  reason: `Won Gift #${gift.serialNumber}`,
                },
              ],
              { session },
            );
          }

          bid.status = "WON";
          bid.wonInRound = auction.currentRoundNumber;
          await bid.save({ session });

          gift.ownerId = userId;
          gift.status = "SOLD";
          gift.purchasePrice = bid.amount;
          gift.wonInRound = auction.currentRoundNumber;
          await gift.save({ session });
        }

        await RankingService.removeWinners(auctionId, winnerIds);
      }

      // === ЭТАП 2: СЛЕДУЮЩИЙ РАУНД ИЛИ ФИНАЛ ===
      currentRound.isProcessed = true;
      const nextRound = auction.rounds.find(
        (r) => r.roundNumber === auction.currentRoundNumber + 1,
      );

      if (nextRound) {
        // Переход к следующему раунду
        auction.currentRoundNumber++;
        const duration = (nextRound as any).durationSeconds || 300;
        const now = new Date();
        nextRound.endTime = new Date(now.getTime() + duration * 1000);
        console.log(`➡️ Round ${auction.currentRoundNumber} started.`);
      } else {
        // Завершение аукциона и возврат средств (Bulk Refund)
        auction.status = "FINISHED";
        console.log("🏁 Auction Finished. Bulk Refund...");

        const loserIdsStr = await RankingService.getAllParticipants(auctionId);

        if (loserIdsStr.length > 0) {
          const loserIds = loserIdsStr.map((id) => new Types.ObjectId(id));

          const bids = await Bid.find({
            auctionId: auction._id,
            userId: { $in: loserIds },
            status: "ACTIVE",
          }).session(session);

          if (bids.length > 0) {
            const userBulkOps: AnyBulkWriteOperation<IUser>[] = [];
            const bidBulkOps: AnyBulkWriteOperation<IBid>[] = [];
            const txLogs: Omit<
              ITransaction,
              "createdAt" | "updatedAt" | "_id"
            >[] = [];

            for (const bid of bids) {
              userBulkOps.push({
                updateOne: {
                  filter: { _id: bid.userId },
                  update: {
                    $inc: { frozenBalance: -bid.amount, balance: bid.amount },
                  },
                },
              });

              bidBulkOps.push({
                updateOne: {
                  filter: { _id: bid._id },
                  update: { $set: { status: "REFUNDED" } },
                },
              });

              txLogs.push({
                userId: bid.userId,
                auctionId: auction._id,
                amount: bid.amount,
                type: "BID_UNFREEZE",
                balanceAfter: 0,
                frozenAfter: 0,
                reason: "Auction lost, refund",
              });
            }

            if (userBulkOps.length > 0)
              await User.bulkWrite(userBulkOps, { session });
            if (bidBulkOps.length > 0)
              await Bid.bulkWrite(bidBulkOps, { session });
            if (txLogs.length > 0)
              await Transaction.insertMany(txLogs, { session });

            console.log(`💸 Refunded ${bids.length} users.`);
          }
        }
        await RankingService.clearAuction(auctionId);
      }

      await auction.save({ session });
      await session.commitTransaction();
    } catch (e) {
      console.error("❌ Round Processing Error:", e);
      await session.abortTransaction();
    } finally {
      session.endSession();
      if (lock) await lock.release();
    }
  }

  /**
   * 5. Состояние аукциона
   */
  static async getAuctionState(auctionId: string) {
    if (!mongoose.Types.ObjectId.isValid(auctionId)) return null;
    const auction = await Auction.findById(auctionId);
    if (!auction) return null;

    const topIds = await RankingService.getTopBidders(auctionId, 50);
    const objectIds = topIds.map((id) => new Types.ObjectId(id));
    const users = await User.find({ _id: { $in: objectIds } }, "username");

    const leaderboard = [];
    for (const userId of topIds) {
      const u = users.find((user) => user._id.toString() === userId);
      const score = await redisClient.zscore(
        `auction:${auctionId}:leaderboard`,
        userId,
      );
      if (u) {
        leaderboard.push({
          userId: u._id.toString(),
          username: u.username,
          amount: Number(score),
        });
      }
    }

    const currentRound = auction.rounds.find(
      (r) => r.roundNumber === auction.currentRoundNumber,
    );
    let cutoffPrice = auction.startPrice;

    if (currentRound) {
      cutoffPrice = await RankingService.getMinEntryPrice(
        auctionId,
        currentRound.giftCount,
        auction.startPrice,
      );
    }

    return {
      auction,
      leaderboard,
      cutoffPrice,
      participantsCount: await RankingService.getParticipantsCount(auctionId),
    };
  }
}
