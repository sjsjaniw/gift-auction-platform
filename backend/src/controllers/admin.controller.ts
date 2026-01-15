import { Request, Response } from "express";
import { initializeDemo, startTrafficGen } from "../scripts/setup-demo";

export const resetAndStartDemo = async (req: Request, res: Response) => {
  try {
    const data = await initializeDemo();

    // Получаем IO из request (мы добавили его в middleware в index.ts)
    const io = (req as any).io;

    // Запускаем трафик с io
    startTrafficGen(data.auctionId, data.botsList, 60, io).catch((err) =>
      console.error("Traffic Gen Error:", err),
    );

    res.json({
      success: true,
      message: "Database wiped. Demo started.",
      data: {
        auctionId: data.auctionId,
        myUserId: data.adminId,
        bots: data.bots, // 👈 Отправляем список ботов
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to setup demo" });
  }
};
