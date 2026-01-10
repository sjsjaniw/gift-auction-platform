import { Request, Response } from "express";
import { AuctionService } from "../services/auction.service";

export const makeBid = async (req: Request, res: Response) => {
  try {
    const { auctionId, amount } = req.body;

    // Получаем ID пользователя из заголовков (симуляция авторизации)
    const headerUserId = req.headers["x-user-id"] as string | undefined;
    const bodyUserId = req.body.userId as string | undefined;
    const userId = headerUserId || bodyUserId;

    if (!userId) {
      res.status(401).json({ error: "User ID required (x-user-id header)" });
      return;
    }

    // Вызываем бизнес-логику (там внутри проверки баланса, времени, цены)
    const result = await AuctionService.placeBid(
      userId,
      auctionId,
      Number(amount),
    );

    // 🔥 Real-time обновление
    // Если ставка прошла успешно, мы должны оповестить всех зрителей,
    // чтобы у них обновилась таблица лидеров и таймер (если сработал anti-sniping)
    const io = (req as any).io;
    if (io) {
      const newState = await AuctionService.getAuctionState(String(auctionId));
      io.to(String(auctionId)).emit("auctionUpdate", newState);
    }

    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Возвращаем 400, чтобы фронтенд мог показать ошибку (например "Слишком низкая ставка")
    res.status(400).json({ error: message });
  }
};
