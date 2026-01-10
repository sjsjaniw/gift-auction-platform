import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/user.model";
import { Auction } from "../models/auction.model"; // <--- ВОТ ЭТОГО НЕ ХВАТАЛО
import { connectDB } from "../config/db";

dotenv.config();

// Используем 127.0.0.1 чтобы избежать проблем с IPv6
const API_URL = "http://127.0.0.1:3000/api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  console.log("🔵 Starting Bot Script...");

  // 1. Подключаемся к БД
  await connectDB();

  // 2. Проверяем наличие ботов
  const bots = await User.find({ username: { $regex: "sim_bot_" } });
  if (bots.length === 0) {
    console.error(
      "❌ No bots found! Run 'npx ts-node src/scripts/setup-sim.ts' first.",
    );
    process.exit(1);
  }
  console.log(`🤖 Loaded ${bots.length} bots.`);

  // 3. Ищем активный аукцион
  const activeAuction = await Auction.findOne({ status: "ACTIVE" });

  if (!activeAuction) {
    console.error("❌ No active auction found in DB.");
    process.exit(1);
  }

  const auctionId = activeAuction._id.toString();
  console.log(`🎯 Target Auction: "${activeAuction.title}"`);
  console.log(`🔥 Starting bidding loop...`);

  // Начинаем чуть выше текущей цены, если она есть, или с startPrice
  let currentPrice = activeAuction.startPrice || 100;

  // 4. Бесконечный цикл ставок
  while (true) {
    const randomBot = bots[Math.floor(Math.random() * bots.length)];
    if (!randomBot) continue;

    // Немного повышаем цену
    currentPrice += Math.floor(Math.random() * 20) + 10;

    try {
      // Отправляем запрос
      const response = await fetch(`${API_URL}/bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": randomBot._id.toString(),
        },
        body: JSON.stringify({
          userId: randomBot._id.toString(),
          auctionId: auctionId,
          amount: currentPrice,
        }),
      });

      const data: any = await response.json();

      if (response.ok) {
        // Успех
        process.stdout.write(
          `\r✅ Bid: ${currentPrice} by ${randomBot.username}   `,
        );
      } else {
        // Ошибка от сервера (например, цена устарела)
        const errMsg = data.error || "Unknown error";

        if (errMsg.includes("higher than")) {
          // Если мы отстали от рынка, накидываем цену
          currentPrice += 100;
        }
        process.stdout.write(`\r⚠️  Server: ${errMsg}          `);
      }
    } catch (e: any) {
      // Ошибка сети
      console.log(`\n❌ NETWORK ERROR: ${e.message}`);
      if (e.cause && e.cause.code === "ECONNREFUSED") {
        console.log(
          "👉 Server seems down. Please run 'npm run dev' in another terminal.",
        );
        process.exit(1);
      }
    }

    // Задержка 100мс
    await sleep(100);
  }
};

run();
