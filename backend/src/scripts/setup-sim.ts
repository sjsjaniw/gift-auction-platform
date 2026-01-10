import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/user.model";
import { Auction } from "../models/auction.model"; // Используем модель напрямую для очистки
import { AuctionService } from "../services/auction.service";
import { connectDB } from "../config/db";
import { redisClient } from "../config/redis";

dotenv.config();

const BOTS_COUNT = 500;

const run = async () => {
  try {
    await connectDB();

    console.log("🧹 Cleaning up old data...");
    await redisClient.flushall();
    await Auction.deleteMany({}); // <--- ВАЖНО: Удаляем старые аукционы без durationSeconds
    await User.deleteMany({ username: { $regex: "sim_bot_" } });

    console.log("🏗️  Setting up Simulation...");

    // 1. Создаем Аукцион
    const startTime = new Date();
    // Раунд 1: 10 минут (600 сек)
    const round1Duration = 10 * 60;
    // Раунд 2: 20 минут (1200 сек)
    const round2Duration = 20 * 60;

    const auction = await AuctionService.createAuction({
      title: "Live Demo Battle",
      startPrice: 100,
      minStep: 10,
      totalQuantity: 50,
      status: "ACTIVE",
      startTime: startTime,
      currentRoundNumber: 1,
      // Метаданные (схема требует)
      assetName: "Golden Star",
      assetSymbol: "⭐️",
      assetColor: "#FFD700",

      rounds: [
        {
          roundNumber: 1,
          giftCount: 10,
          durationSeconds: round1Duration, // <--- ДОБАВЛЕНО
          endTime: new Date(startTime.getTime() + round1Duration * 1000),
        },
        {
          roundNumber: 2,
          giftCount: 20,
          durationSeconds: round2Duration, // <--- ДОБАВЛЕНО
          endTime: new Date(
            startTime.getTime() + (round1Duration + round2Duration) * 1000,
          ),
        },
      ],
    });
    console.log(`✅ Auction Created: "${auction.title}"`);

    // 2. Создаем Ботов
    console.log(`🤖 Creating ${BOTS_COUNT} bots...`);
    const batch = [];
    for (let i = 0; i < BOTS_COUNT; i++) {
      batch.push({
        username: `sim_bot_${i}`,
        balance: 1000000,
        frozenBalance: 0,
      });
    }
    await User.insertMany(batch);
    console.log(`✅ Bots ready.`);

    // 3. Создаем Тебя (чтобы ты мог зайти)
    await User.deleteOne({ username: "admin_player" });
    const me = await User.create({
      username: "admin_player",
      balance: 5000000,
    });

    console.log("\n=================================");
    console.log("🎉 SETUP COMPLETE. READY FOR DEMO");
    console.log("=================================");
    console.log(`🆔 YOUR USER ID:  ${me._id}`);
    console.log("=================================");

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

run();
