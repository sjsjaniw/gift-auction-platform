import mongoose, { InferSchemaType } from "mongoose";

// Конфиг раунда
const roundConfigSchema = new mongoose.Schema(
  {
    roundNumber: { type: Number, required: true },

    // Сколько подарков разыгрываем (например, 20)
    giftCount: { type: Number, required: true },

    // Длительность раунда в секундах (например, 3600 для первого, 300 для остальных)
    // Это нужно, чтобы пересчитать endTime, если предыдущий раунд затянулся
    durationSeconds: { type: Number, required: true },

    // Фактическое время окончания (вычисляем при старте раунда или обновляем при снайпинге)
    endTime: { type: Date, required: true },

    isProcessed: { type: Boolean, default: false },
  },
  { _id: false },
);

const auctionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },

    // Начальная цена (если участников < кол-ва подарков)
    startPrice: { type: Number, required: true, default: 100 },

    // Шаг аукциона (в ТЗ сказано "на 1 больше", значит шаг = 1)
    minStep: { type: Number, default: 1 },

    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "FINISHED", "CANCELLED"],
      default: "PENDING",
    },

    startTime: { type: Date, required: true },

    rounds: [roundConfigSchema],

    currentRoundNumber: { type: Number, default: 1 },
    totalQuantity: { type: Number, required: true },
  },
  { timestamps: true },
);

export type IAuction = InferSchemaType<typeof auctionSchema>;
export const Auction = mongoose.model("Auction", auctionSchema);
