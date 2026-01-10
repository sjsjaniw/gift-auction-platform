import { Request, Response } from "express";
import { AuctionService } from "../services/auction.service";
import mongoose from "mongoose";

/**
 * 1. Создание аукциона
 * POST /api/auctions
 * Тело: { title, startPrice, assetName, rounds: [...], ... }
 */
export const createAuction = async (req: Request, res: Response) => {
  try {
    const auctionData = req.body;
    // Создаем аукцион и "чеканим" подарки
    const auction = await AuctionService.createAuction(auctionData);
    res.status(201).json(auction);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: message });
  }
};

/**
 * 2. Список активных аукционов
 * GET /api/auctions
 */
export const getAuctionsList = async (req: Request, res: Response) => {
  try {
    const auctions = await AuctionService.getActiveAuctions();
    res.json(auctions);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * 3. Детальное состояние (для отрисовки страницы)
 * GET /api/auction/:id
 */
export const getAuctionState = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid Auction ID" });
      return;
    }

    const state = await AuctionService.getAuctionState(id);

    if (!state) {
      res.status(404).json({ error: "Auction not found or ended" });
      return;
    }

    res.json(state);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * 4. Сделать ставку
 * POST /api/bid
 */

/**
 * 5. Инфо о пользователе
 * GET /api/user/:id
 */

/**
 * 7. Тестовый кран (Faucet) - Для судей
 * POST /api/user/:id/faucet
 * --- НОВЫЙ МЕТОД ---
 */
