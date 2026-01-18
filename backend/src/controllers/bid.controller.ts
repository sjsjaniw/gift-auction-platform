import { Request, Response } from "express";
import { AuctionService } from "../services/auction.service";

export const makeBid = async (req: Request, res: Response) => {
  try {
    const { auctionId, amount } = req.body;

    const headerUserId = req.headers["x-user-id"] as string | undefined;
    const bodyUserId = req.body.userId as string | undefined;
    const userId = headerUserId || bodyUserId;

    if (!userId) {
      res.status(401).json({ error: "User ID required (x-user-id header)" });
      return;
    }

    const result = await AuctionService.placeBid(
      userId,
      auctionId,
      Number(amount),
    );

    const io = (req as any).io;
    if (io) {
      const newState = await AuctionService.getAuctionState(String(auctionId));
      io.to(String(auctionId)).emit("auctionUpdate", newState);
    }

    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(400).json({ error: message });
  }
};
