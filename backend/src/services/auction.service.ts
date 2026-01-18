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
import { AnyBulkWriteOperation } from "mongoose";
import { IUser } from "../models/user.model";
import { IBid } from "../models/bid.model";
import { ITransaction } from "../models/transaction.model";
import { logger } from "../utils/logger";
import { getIO } from "../socket";

interface ExecutionLock {
  release(): Promise<void>;
}

export class AuctionService {
  static async createAuction(data: CreateAuctionDto) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
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

  static async getActiveAuctions() {
    return Auction.find(
      { status: { $in: ["ACTIVE", "PENDING"] } },
      "title status startTime currentRoundNumber totalQuantity rounds assetSymbol assetColor",
    ).sort({ createdAt: -1 });
  }

  static async placeBid(
    userId: string,
    auctionId: string,
    totalAmount: number,
  ) {
    const lockKey = `lock:bid:${auctionId}:${userId}`;
    let lock: ExecutionLock | null = null;

    try {
      lock = (await redlock.acquire(
        [lockKey],
        4000,
      )) as unknown as ExecutionLock;
    } catch (e) {
      logger.warn("Bid blocked (Concurrency)", {
        userId,
        auctionId,
        reason: "Too many requests (Redlock)",
      });

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
        status: "WON",
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

          logger.info("Round time extended (Anti-Sniping)", { auctionId });
        }
      }

      await session.commitTransaction();

      const rank = await RankingService.getUserPosition(auctionId, userId);

      logger.info("Bid placed", {
        userId,
        auctionId,
        amount: totalAmount,
        rank,
        balance: user.balance,
      });

      return {
        success: true,
        rank,
        totalAmount,
        balance: user.balance,
        frozen: user.frozenBalance,
      };
    } catch (e) {
      await session.abortTransaction();

      logger.warn("Bid failed (Logic)", {
        userId,
        auctionId,
        amount: totalAmount,
        reason: e instanceof Error ? e.message : "Unknown error",
      });

      throw e;
    } finally {
      session.endSession();
      if (lock) await lock.release();
    }
  }

  static async processRoundEnd(auctionId: string) {
    const lockKey = `lock:process:${auctionId}`;

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

      logger.info(`Processing Round ${auction.currentRoundNumber}...`);

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
            logger.error(`Missing bid for winner ${userIdStr}`);
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

      currentRound.isProcessed = true;
      const nextRound = auction.rounds.find(
        (r) => r.roundNumber === auction.currentRoundNumber + 1,
      );

      if (nextRound) {
        auction.currentRoundNumber++;
        const duration = (nextRound as any).durationSeconds || 300;
        const now = new Date();
        nextRound.endTime = new Date(now.getTime() + duration * 1000);
        logger.info(`Round ${auction.currentRoundNumber} started.`);
      } else {
        auction.status = "FINISHED";
        logger.info("Auction Finished. Bulk Refund...");

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

            logger.info(`Refunded ${bids.length} users.`);
          }
        }
        await RankingService.clearAuction(auctionId);
      }

      await auction.save({ session });
      await session.commitTransaction();
      try {
        const io = getIO();
        const newState = await AuctionService.getAuctionState(auctionId);
        if (newState) {
          io.to(auctionId).emit("auctionUpdate", newState);
          logger.info("Socket update sent from Worker");
        }
      } catch (err) {
        logger.error("Socket error in worker (ignoring)", err);
      }
    } catch (e) {
      logger.info("Round Processing Error:", e);
      await session.abortTransaction();
    } finally {
      session.endSession();
      if (lock) await lock.release();
    }
  }

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
