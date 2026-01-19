import { AuctionService } from "../services/auction.service";
import { Auction } from "../models/auction.model";
import { User } from "../models/user.model";
import { Bid } from "../models/bid.model";
import { Gift } from "../models/gift.model";
import { Transaction } from "../models/transaction.model";
import { redisClient } from "../config/redis";
import { Server } from "socket.io";

const CONFIG = {
  adminName: "Admin",
  botsCount: 5000,
  auctionTitle: "Auction Demo",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const initializeDemo = async () => {
  await Promise.all([
    Auction.deleteMany({}),
    User.deleteMany({}),
    Bid.deleteMany({}),
    Gift.deleteMany({}),
    Transaction.deleteMany({}),
    redisClient.flushall(),
  ]);

  const admin = await User.create({
    username: CONFIG.adminName,
    balance: 100_000_000_000,
  });

  const botsData = [];
  for (let i = 1; i <= CONFIG.botsCount; i++) {
    botsData.push({
      username: `Bot_${i}`,
      balance: 500_000,
      frozenBalance: 0,
    });
  }
  const bots = await User.insertMany(botsData);

  const startTime = new Date();
  const auction = await AuctionService.createAuction({
    title: CONFIG.auctionTitle,
    startPrice: 100,
    minStep: 10,
    totalQuantity: 10,
    status: "ACTIVE",
    startTime: startTime,
    currentRoundNumber: 1,
    assetName: "Blue Gem",
    assetSymbol: "GEM",
    assetColor: "#00C7FC",
    rounds: [
      {
        roundNumber: 1,
        giftCount: 5,
        durationSeconds: 60,
        endTime: new Date(startTime.getTime() + 60000),
      },
      {
        roundNumber: 2,
        giftCount: 5,
        durationSeconds: 60,
        endTime: new Date(startTime.getTime() + 120000),
      },
    ],
  });

  return {
    auctionId: auction._id.toString(),
    adminId: admin._id.toString(),
    bots: bots.map((b) => ({ id: b._id.toString(), username: b.username })),
    botsList: bots,
  };
};

export const startTrafficGen = async (
  auctionId: string,
  bots: any[],
  durationSeconds: number,
  io: Server,
) => {
  console.log(`\nSTARTING CONCURRENT LOAD TEST (${durationSeconds}s)`);
  console.log(`Active Bots: ${bots.length}`);
  console.log(`Strategy: Waves of parallel requests\n`);

  const endTime = Date.now() + durationSeconds * 1000;
  let currentEstimatedPrice = 100;

  while (Date.now() < endTime) {
    const WAVE_SIZE = Math.floor(Math.random() * 10) + 5;
    const promises = [];

    for (let i = 0; i < WAVE_SIZE; i++) {
      const randomBot = bots[Math.floor(Math.random() * bots.length)];
      const bidAmount =
        currentEstimatedPrice + Math.floor(Math.random() * 50) + 10;

      const p = AuctionService.placeBid(
        randomBot._id.toString(),
        auctionId,
        bidAmount,
      )
        .then((res) => {
          if (res.totalAmount > currentEstimatedPrice) {
            currentEstimatedPrice = res.totalAmount;
          }
          process.stdout.write("[OK] ");
          return "success";
        })
        .catch((err) => {
          const msg = err.message || "";
          if (
            msg.includes("Too fast") ||
            msg.includes("lock") ||
            msg.includes("optimistic")
          ) {
            process.stdout.write("[LOCKED] ");
            return "blocked";
          } else if (msg.includes("too low")) {
            process.stdout.write("[LOW] ");
            return "low_bid";
          } else {
            process.stdout.write("[ERR] ");
            return "error";
          }
        });

      promises.push(p);
    }

    await Promise.all(promises);

    console.log(` | Price: ${currentEstimatedPrice}`);

    if (io) {
      try {
        const newState = await AuctionService.getAuctionState(auctionId);
        if (newState) {
          if (newState.leaderboard) {
            newState.leaderboard = newState.leaderboard.slice(0, 10);
          }
          io.to(auctionId).emit("auctionUpdate", newState);
        }
      } catch (e) {
        console.error("Socket emit failed", e);
      }
    }

    await sleep(Math.floor(Math.random() * 300) + 100);
  }

  console.log("\nTraffic Simulation Finished");
};
