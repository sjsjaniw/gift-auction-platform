import { Request, Response } from "express";
import { User } from "../models/user.model";
import { Gift } from "../models/gift.model";
import { Transaction } from "../models/transaction.model";
import mongoose from "mongoose";

export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "ID required" });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      _id: user._id,
      username: user.username,
      balance: user.balance,
      frozen: user.frozenBalance,
    });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * 6. Инвентарь пользователя (Выигранные подарки)
 * GET /api/user/:id/inventory
 * --- НОВЫЙ МЕТОД ---
 */
export const getUserInventory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Проверяем валидность ID (иначе new ObjectId упадет с ошибкой)
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid User ID" });
      return;
    }

    // 2. Явно преобразуем string -> ObjectId
    const userObjectId = new mongoose.Types.ObjectId(id);

    // 3. Ищем
    const gifts = await Gift.find({
      ownerId: userObjectId, // <--- ТЕПЕРЬ ТИПЫ СОВПАДАЮТ
      status: "SOLD",
    })
      .sort({ createdAt: -1 })
      .select(
        "assetName assetSymbol assetColor serialNumber purchasePrice wonInRound auctionId",
      );

    res.json(gifts);
  } catch (e) {
    console.error("Inventory Error:", e);
    res.status(500).json({ error: "Server error" });
  }
};

export const claimFaucet = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const amount = 1000; // Фиксированная сумма

    const user = await User.findById(id).session(session);
    if (!user) throw new Error("User not found");

    // Начисляем
    user.balance += amount;
    await user.save({ session });

    // Пишем лог (DEPOSIT)
    await Transaction.create(
      [
        {
          userId: user._id,
          amount: amount,
          type: "DEPOSIT",
          balanceAfter: user.balance,
          frozenAfter: user.frozenBalance,
          reason: "Testnet Faucet Claim",
        },
      ],
      { session },
    );

    await session.commitTransaction();

    res.json({ success: true, newBalance: user.balance });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ error: "Faucet failed" });
  } finally {
    session.endSession();
  }
};
