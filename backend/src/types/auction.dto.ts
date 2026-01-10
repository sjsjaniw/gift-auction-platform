export interface CreateRoundInput {
  roundNumber: number;
  giftCount: number;

  // Мы договорились использовать длительность, чтобы вычислять время динамически
  durationSeconds: number;

  // Но для обратной совместимости или ручного запуска можно оставить и дату
  endTime?: Date | string;
}

export interface CreateAuctionInput {
  title: string;
  startPrice: number;
  minStep?: number; // Опционально, дефолт 1
  startTime: Date | string;
  totalQuantity: number;

  // Конфигурация раундов
  rounds: CreateRoundInput[];

  // Метаданные актива (NFT)
  assetName: string; // "Blue Star"
  assetSymbol?: string; // "⭐️"
  assetColor?: string; // "#007aff"

  // Статус (обычно ACTIVE или PENDING)
  status?: "PENDING" | "ACTIVE" | "FINISHED";
  currentRoundNumber?: number;
}
