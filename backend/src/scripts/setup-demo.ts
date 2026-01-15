import { AuctionService } from "../services/auction.service";
import { Auction } from "../models/auction.model";
import { User } from "../models/user.model";
import { Bid } from "../models/bid.model";
import { Gift } from "../models/gift.model";
import { Transaction } from "../models/transaction.model";
import { redisClient } from "../config/redis";
import { Server } from "socket.io"; // 👈 Импорт типа

const CONFIG = {
  adminName: "Admin",
  botsCount: 50, // 15 ботов достаточно для демки
  auctionTitle: "demo auction",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const initializeDemo = async () => {
  // Очистка
  await Promise.all([
    Auction.deleteMany({}),
    User.deleteMany({}),
    Bid.deleteMany({}),
    Gift.deleteMany({}),
    Transaction.deleteMany({}),
    redisClient.flushall(),
  ]);

  // Админ
  const admin = await User.create({
    username: CONFIG.adminName,
    balance: 10_000_000,
  });

  // Боты
  const botsData = [];
  for (let i = 1; i <= CONFIG.botsCount; i++) {
    botsData.push({
      username: `Bot_${i}`, // Сделал имя покрасивее
      balance: 500_000,
      frozenBalance: 0,
    });
  }
  const bots = await User.insertMany(botsData);

  // Аукцион
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
    assetSymbol: "💎",
    assetColor: "#00C7FC",
    rounds: [
      {
        roundNumber: 1,
        giftCount: 5,
        durationSeconds: 180,
        endTime: new Date(startTime.getTime() + 180000),
      },
      {
        roundNumber: 2,
        giftCount: 5,
        durationSeconds: 120,
        endTime: new Date(startTime.getTime() + 300000),
      },
    ],
  });

  return {
    auctionId: auction._id.toString(),
    adminId: admin._id.toString(),
    // Возвращаем полные объекты, чтобы отобразить имена на фронте
    bots: bots.map((b) => ({ id: b._id.toString(), username: b.username })),
    botsList: bots, // Для внутреннего использования
  };
};

// 👇 Добавили аргумент io
export const startTrafficGen = async (
  auctionId: string,
  bots: any[],
  durationSeconds: number,
  io: Server,
) => {
  console.log(`🤖 Traffic started for ${durationSeconds}s`);
  const endTime = Date.now() + durationSeconds * 1000;

  let currentEstimatedPrice = 100;

  while (Date.now() < endTime) {
    const randomBot = bots[Math.floor(Math.random() * bots.length)];
    const bidAmount = currentEstimatedPrice + Math.floor(Math.random() * 50);

    try {
      await AuctionService.placeBid(
        randomBot._id.toString(),
        auctionId,
        bidAmount,
      );
      currentEstimatedPrice = bidAmount;

      // 🔥 ВАЖНО: Эмитим событие обновления для всех клиентов
      // Чтобы лидерборд прыгал в реальном времени
      const newState = await AuctionService.getAuctionState(auctionId);
      if (newState && io) {
        io.to(auctionId).emit("auctionUpdate", newState);
      }
    } catch (e) {
      currentEstimatedPrice += 20;
    }

    await sleep(300); // Чуть медленнее, чтобы не спамить сокеты насмерть
  }
  console.log("🤖 Traffic finished");
};
