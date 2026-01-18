export interface CreateRoundInput {
  roundNumber: number;
  giftCount: number;
  durationSeconds: number;
  endTime?: Date | string;
}

export interface CreateAuctionInput {
  title: string;
  startPrice: number;
  minStep?: number;
  startTime: Date | string;
  totalQuantity: number;
  rounds: CreateRoundInput[];
  assetName: string;
  assetSymbol?: string;
  assetColor?: string;
  status?: "PENDING" | "ACTIVE" | "FINISHED";
  currentRoundNumber?: number;
}
