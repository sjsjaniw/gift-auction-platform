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
  botsCount: 100,
  auctionTitle: "Start Demo",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const initializeDemo = async () => {
  console.log("🧹 Wiping Database...");
  await Promise.all([
    Auction.deleteMany({}),
    User.deleteMany({}),
    Bid.deleteMany({}),
    Gift.deleteMany({}),
    Transaction.deleteMany({}),
    redisClient.flushall(),
  ]);

  console.log("🤖 Creating Users...");
  const admin = await User.create({
    username: CONFIG.adminName,
    balance: 100_000_000_000,
  });

  const botsData = [];
  for (let i = 1; i <= CONFIG.botsCount; i++) {
    botsData.push({
      username: `Bot_${i}`,
      balance: 10_000,
      frozenBalance: 0,
    });
  }
  const bots = await User.insertMany(botsData);

  const startTime = new Date();

  const auction = await AuctionService.createAuction({
    title: CONFIG.auctionTitle,
    startPrice: 100,
    minStep: 10,
    totalQuantity: 30,
    status: "ACTIVE",
    startTime: startTime,
    currentRoundNumber: 1,
    assetName: "Blue Star",
    assetSymbol: "STAR",
    assetColor: "#007aff",
    rounds: [
      {
        roundNumber: 1,
        giftCount: 10,
        durationSeconds: 60,
        endTime: new Date(startTime.getTime() + 60000),
      },
      {
        roundNumber: 2,
        giftCount: 10,
        durationSeconds: 30,
        endTime: new Date(startTime.getTime() + 60000 + 30000),
      },
      {
        roundNumber: 3,
        giftCount: 10,
        durationSeconds: 30,
        endTime: new Date(startTime.getTime() + 60000 + 30000 + 30000),
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
  console.log(`\n👨‍🔬 STARTING SYSTEM INTEGRITY TESTS (Round 1)\n`);

  //Race Condition
  await runRaceConditionTest(auctionId, bots[0], bots[1]);

  //Double Spend
  await runDoubleSpendTest(auctionId, bots[2]);

  // Anti-Sniping
  await runAntiSnipingTest(auctionId, bots[3]);

  // Random Bids
  console.log(
    `\n🌪 Starting Chaos Mode (Random Bids for ${durationSeconds}s)...`,
  );
  await runChaosMode(auctionId, bots.slice(10), durationSeconds * 1000, io);

  await runFinancialAudit(bots.length + 1);
};

async function runRaceConditionTest(auctionId: string, botA: any, botB: any) {
  console.log("🧪 TEST 1: Race Condition (Same price, same time)");

  const state = await AuctionService.getAuctionState(auctionId);
  const targetPrice = (state?.cutoffPrice || 100) + 50;

  console.log(`   Both bots bidding ${targetPrice}...`);

  const p1 = AuctionService.placeBid(
    botA._id.toString(),
    auctionId,
    targetPrice,
  );
  const p2 = AuctionService.placeBid(
    botB._id.toString(),
    auctionId,
    targetPrice,
  );

  const results = await Promise.allSettled([p1, p2]);

  const successCount = results.filter((r) => r.status === "fulfilled").length;
  const failCount = results.filter((r) => r.status === "rejected").length;

  if (successCount === 1 && failCount === 1) {
    console.log("   ✅ PASS: Only one bid was accepted.");
  } else {
    console.error("   ❌ FAIL: Logic error. Successes:", successCount);
  }
}

async function runDoubleSpendTest(auctionId: string, bot: any) {
  console.log("\n🧪 TEST 2: Double Spend (Insufficient balance spam)");

  await User.findByIdAndUpdate(bot._id, { balance: 100, frozenBalance: 0 });

  const state = await AuctionService.getAuctionState(auctionId);
  const validBidPrice = (state?.cutoffPrice || 100) + 5;

  await User.findByIdAndUpdate(bot._id, {
    balance: validBidPrice,
    frozenBalance: 0,
  });

  console.log(
    `   Bot Balance: ${validBidPrice}. Bidding ${validBidPrice} x 5 times instantly.`,
  );

  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      AuctionService.placeBid(bot._id.toString(), auctionId, validBidPrice),
    );
  }

  const results = await Promise.allSettled(promises);
  const successes = results.filter((r) => r.status === "fulfilled").length;

  if (successes <= 1) {
    console.log(`   ✅ PASS: Accepted ${successes}/5 bids. No double spend.`);
  } else {
    console.error(
      `   ❌ FAIL: Accepted ${successes} bids! Money created from thin air!`,
    );
  }
}

async function runAntiSnipingTest(auctionId: string, bot: any) {
  console.log("\n🧪 TEST 3: Anti-Sniping (Time extension)");

  const almostFinished = new Date(Date.now() + 10000);
  const auction = await Auction.findById(auctionId);
  if (auction && auction.rounds[0]) {
    auction.rounds[0].endTime = almostFinished;
    await auction.save();
  }

  console.log("   Clock set to T-10s. Placing bid...");

  const stateBefore = await AuctionService.getAuctionState(auctionId);
  const price = (stateBefore?.cutoffPrice || 100) + 10;

  await AuctionService.placeBid(bot._id.toString(), auctionId, price);

  const auctionAfter = await Auction.findById(auctionId);
  // @ts-ignore
  const newEndTime = new Date(auctionAfter.rounds[0].endTime).getTime();
  const oldEndTime = almostFinished.getTime();

  const diff = newEndTime - oldEndTime;

  if (diff >= 30000) {
    console.log(`   ✅ PASS: Round extended by ${diff / 1000}s`);
  } else {
    console.error(`   ❌ FAIL: Time did not extend! Diff: ${diff}`);
  }
}

async function runChaosMode(
  auctionId: string,
  bots: any[],
  durationMs: number,
  io: Server,
) {
  const end = Date.now() + durationMs;
  let localPrice = 200;

  while (Date.now() < end) {
    const batchSize = 10;
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const bid = localPrice + Math.floor(Math.random() * 20);

      promises.push(
        AuctionService.placeBid(bot._id.toString(), auctionId, bid)
          .then((r) => {
            if (r.totalAmount > localPrice) localPrice = r.totalAmount;
          })
          .catch(() => {}),
      );
    }
    await Promise.all(promises);

    const state = await AuctionService.getAuctionState(auctionId);
    if (state) io.to(auctionId).emit("auctionUpdate", state);

    await sleep(100);
  }
}

async function runFinancialAudit(expectedUserCount: number) {
  console.log("\n👮 FINANCIAL AUDIT REPORT");
  console.log("------------------------------------------------");

  const users = await User.find({});

  let totalCurrentMoney = 0;
  users.forEach((u) => {
    totalCurrentMoney += u.balance + u.frozenBalance;
  });

  const initialMoney = 100_000_000_000 + 100 * 10_000;

  const bot3 = users.find((u) => u.username === "Bot_3");
  let burnedInTests = 0;
  if (bot3) {
    burnedInTests = 10_000 - (bot3.balance + bot3.frozenBalance);
  }

  const expectedMoney = initialMoney - burnedInTests;

  console.log(`Initial Supply:       ${initialMoney.toLocaleString()}`);
  console.log(`Burned in Tests:     -${burnedInTests.toLocaleString()}`);
  console.log(`Expected Total:       ${expectedMoney.toLocaleString()}`);
  console.log(`Actual Total:         ${totalCurrentMoney.toLocaleString()}`);

  if (totalCurrentMoney === expectedMoney) {
    console.log("✅ PASS: Total Money Supply is correct (Math matches).");
  } else {
    console.error(
      `❌ FAIL: Money leaked! Diff: ${totalCurrentMoney - expectedMoney}`,
    );
  }

  const negativeUsers = users.filter(
    (u) => u.balance < 0 || u.frozenBalance < 0,
  );
  if (negativeUsers.length > 0) {
    console.error("❌ CRITICAL: Found users with negative balance!");
  } else {
    console.log("✅ PASS: No negative balances found.");
  }

  const activeBids = await Bid.find({ status: "ACTIVE" });
  let totalInBids = 0;
  activeBids.forEach((b) => (totalInBids += b.amount));

  let totalUserFrozen = 0;
  users.forEach((u) => (totalUserFrozen += u.frozenBalance));

  if (totalInBids === totalUserFrozen) {
    console.log("✅ PASS: Frozen Balances match Active Bids exactly.");
  } else {
    console.error(
      `❌ FAIL: Frozen balance mismatch! Users: ${totalUserFrozen}, Bids: ${totalInBids}`,
    );
  }

  console.log("------------------------------------------------");
}
