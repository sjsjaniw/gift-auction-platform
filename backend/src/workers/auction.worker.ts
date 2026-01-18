import { Auction } from "../models/auction.model";
import { AuctionService } from "../services/auction.service";
import { logger } from "../utils/logger";

let isProcessing = false;

export const startAuctionWorker = () => {
  logger.info("Auction Worker started...");
  runWorkerLoop();
};

const runWorkerLoop = async () => {
  if (isProcessing) {
    setTimeout(runWorkerLoop, 1000);
    return;
  }

  isProcessing = true;

  try {
    const activeAuctions = await Auction.find({ status: "ACTIVE" });
    const now = new Date();

    for (const auction of activeAuctions) {
      const currentRound = auction.rounds.find(
        (r: any) => r.roundNumber === auction.currentRoundNumber,
      );

      if (
        currentRound &&
        !currentRound.isProcessed &&
        now >= new Date(currentRound.endTime)
      ) {
        logger.info(
          `Time's up! Processing round ${auction.currentRoundNumber}...`,
        );
        await AuctionService.processRoundEnd(auction._id.toString());
      }
    }
  } catch (error) {
    logger.error("Worker Loop Error:", error);
  } finally {
    isProcessing = false;
    setTimeout(runWorkerLoop, 1000);
  }
};
