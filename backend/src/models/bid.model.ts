import mongoose, { InferSchemaType } from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auction",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: { type: Number, required: true },

    // ACTIVE   - деньги заморожены, участвует в раундах
    // WON      - выиграл, деньги списаны, подарок выдан (КОНЕЧНЫЙ СТАТУС)
    // REFUNDED - аукцион закончился, ничего не выиграл, деньги вернули (КОНЕЧНЫЙ СТАТУС)
    status: {
      type: String,
      enum: ["ACTIVE", "WON", "REFUNDED"],
      default: "ACTIVE",
    },

    // Заполняем только при победе
    wonInRound: { type: Number },
  },
  { timestamps: true },
);

// 🔥 МАГИЯ: Partial Filter Expression
// Этот индекс говорит: "У юзера может быть только ОДНА ставка со статусом ACTIVE".
// Но ставок со статусом WON или REFUNDED может быть сколько угодно.
bidSchema.index(
  { auctionId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);

export type IBid = InferSchemaType<typeof bidSchema>;
export const Bid = mongoose.model("Bid", bidSchema);
