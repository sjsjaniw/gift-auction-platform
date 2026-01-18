import { Request, Response } from "express";
import { initializeDemo, startTrafficGen } from "../scripts/setup-demo";
import { logger } from "../utils/logger";

export const resetAndStartDemo = async (req: Request, res: Response) => {
  try {
    logger.warn("ADMIN: Resetting database and starting Demo...");

    const data = await initializeDemo();

    const io = (req as any).io;

    startTrafficGen(data.auctionId, data.botsList, 60, io).catch((err) =>
      logger.error("Traffic Gen Error:", err),
    );

    logger.info("Demo Environment Ready", {
      auctionId: data.auctionId,
      botCount: data.bots.length,
    });

    res.json({
      success: true,
      message: "Database wiped. Demo started.",
      data: {
        auctionId: data.auctionId,
        myUserId: data.adminId,
        bots: data.bots,
      },
    });
  } catch (e) {
    logger.error("Failed to setup demo:", e);
    res.status(500).json({ error: "Failed to setup demo" });
  }
};
