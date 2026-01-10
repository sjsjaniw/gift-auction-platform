import mongoose from "mongoose";
import dotenv from "dotenv";
import { Auction } from "../models/auction.model";
import { User } from "../models/user.model";
import { Bid } from "../models/bid.model";
import { Gift } from "../models/gift.model";
import { Transaction } from "../models/transaction.model";
import { AuctionService } from "../services/auction.service";
import { connectDB } from "../config/db";
import { redisClient } from "../config/redis";

dotenv.config();

// ==========================================
// ⚙️ НАСТРОЙКИ (МЕНЯТЬ ТУТ)
// ==========================================
const CONFIG = {
  // Настройки аукциона
  AUCTION: {
    title: "Grand Launch Auction",
    startPrice: 100,
    minStep: 10,

    // Визуал подарка (Asset)
    assetName: "Platinum Star",
    assetSymbol: "🌟",
    assetColor: "#E5E4E2", // Платиновый цвет
  },

  // Настройки раундов (Время в МИНУТАХ)
  ROUNDS: [
    { number: 1, durationMinutes: 1, gifts: 10 }, // 5 минут, 10 мест
    { number: 2, durationMinutes: 1, gifts: 10 }, // 1 минута, 10 мест
    { number: 3, durationMinutes: 1, gifts: 10 }, // 1 минута, 10 мест
  ],

  // Создать ли тестового админа, чтобы сразу зайти?
  CREATE_ADMIN: true,
  ADMIN_USERNAME: "admin_tester",
  ADMIN_BALANCE: 500_000_000_000,
};

// ==========================================
// 🚀 СКРИПТ
// ==========================================
const run = async () => {
  try {
    console.log("🔵 Connecting to DB...");
    await connectDB();

    console.log("🧹 Cleaning up DATABASE...");
    // 1. Очистка базы данных
    await Promise.all([
      Auction.deleteMany({}),
      User.deleteMany({}),
      Bid.deleteMany({}),
      Gift.deleteMany({}),
      Transaction.deleteMany({}),
      redisClient.flushall(), // Очистка Redis
    ]);
    console.log("✨ DB & Redis flushed.");

    // 2. Подготовка конфигурации раундов
    console.log("⚙️  Calculating rounds...");

    const startTime = new Date(); // Аукцион начинается прямо сейчас
    let accumulatedTime = startTime.getTime();

    // Массив раундов для сервиса
    const roundsPayload = [];
    let totalQuantity = 0;

    for (const r of CONFIG.ROUNDS) {
      const durationSec = r.durationMinutes * 60;
      const roundEndTime = new Date(accumulatedTime + durationSec * 1000);

      roundsPayload.push({
        roundNumber: r.number,
        giftCount: r.gifts,
        durationSeconds: durationSec,
        endTime: roundEndTime,
      });

      // Сдвигаем время начала следующего раунда
      accumulatedTime = roundEndTime.getTime();
      // Считаем общее кол-во подарков
      totalQuantity += r.gifts;
    }

    // 3. Создание аукциона
    console.log(`🏗️  Creating Auction "${CONFIG.AUCTION.title}"...`);
    console.log(`📦 Total Gifts: ${totalQuantity}`);
    console.log(
      `⏱️  Total Duration: ${CONFIG.ROUNDS.reduce((acc, r) => acc + r.durationMinutes, 0)} min`,
    );

    const auction = await AuctionService.createAuction({
      title: CONFIG.AUCTION.title,
      startPrice: CONFIG.AUCTION.startPrice,
      minStep: CONFIG.AUCTION.minStep,
      totalQuantity: totalQuantity,
      startTime: startTime,

      // Метаданные
      assetName: CONFIG.AUCTION.assetName,
      assetSymbol: CONFIG.AUCTION.assetSymbol,
      assetColor: CONFIG.AUCTION.assetColor,

      // Раунды
      rounds: roundsPayload,

      // Статус
      status: "ACTIVE",
      currentRoundNumber: 1,
    });

    console.log(`✅ Auction Created! ID: ${auction._id}`);

    // 4. Создание Админа (опционально)
    if (CONFIG.CREATE_ADMIN) {
      const admin = await User.create({
        username: CONFIG.ADMIN_USERNAME,
        balance: CONFIG.ADMIN_BALANCE,
        frozenBalance: 0,
      });

      console.log("\n=================================");
      console.log("👤 TEST USER CREATED");
      console.log("=================================");
      console.log(`🔑 Copy this ID to login:`);
      console.log(`\x1b[32m${admin._id}\x1b[0m`); // Зеленый цвет
      console.log("=================================\n");
    }

    process.exit(0);
  } catch (e) {
    console.error("\n❌ Fatal Error:", e);
    process.exit(1);
  }
};

run();
