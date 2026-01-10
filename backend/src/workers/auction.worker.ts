import { Auction } from "../models/auction.model";
import { AuctionService } from "../services/auction.service";

export const startAuctionWorker = () => {
  console.log("👷 Auction Worker started...");

  // Запускаем первый цикл
  runWorkerLoop();
};

const runWorkerLoop = async () => {
  try {
    // 1. Оптимизация: Берем только нужные поля (Projection), чтобы не тянуть лишние мегабайты
    const activeAuctions = await Auction.find(
      { status: "ACTIVE" },
      "currentRoundNumber rounds status",
    );

    const now = new Date();

    for (const auction of activeAuctions) {
      const currentRound = auction.rounds.find(
        (r) => r.roundNumber === auction.currentRoundNumber,
      );

      // Если раунд закончился и еще не обработан
      if (
        currentRound &&
        !currentRound.isProcessed &&
        now >= currentRound.endTime
      ) {
        console.log(
          `⏰ Round ${auction.currentRoundNumber} ended. Triggering processor...`,
        );

        // Мы ждем завершения обработки, прежде чем идти к следующему аукциону
        // (или можно Promise.all, если хочешь параллельности, но последовательно безопаснее для базы)
        await AuctionService.processRoundEnd(auction._id.toString());
      }
    }
  } catch (error) {
    console.error("❌ Worker Loop Error:", error);
  } finally {
    // ВАЖНО: Планируем следующий запуск ТОЛЬКО когда текущий завершился
    // Это предотвращает наслоение тяжелых операций друг на друга
    setTimeout(runWorkerLoop, 1000);
  }
};
