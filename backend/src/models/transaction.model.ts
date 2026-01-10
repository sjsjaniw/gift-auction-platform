import mongoose, { InferSchemaType, Model } from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auction",
      default: null,
    },

    // Сумма изменения (отрицательная для списаний, положительная для начислений)
    amount: { type: Number, required: true },

    // ТИП ОПЕРАЦИИ (Добавим уточнения)
    type: {
      type: String,
      enum: [
        "DEPOSIT", // Ввод денег (тестовый)
        "BID_FREEZE", // Заморозка средств при ставке (Balance -> Frozen)
        "BID_UNFREEZE", // Разморозка (возврат проигравшему) (Frozen -> Balance)
        "BID_PAYMENT", // Списание выигравшего (Frozen -> Burn)
      ],
      required: true,
    },

    // 🔥 ВАЖНО: Снэпшот балансов ПОСЛЕ операции
    // Это позволяет мгновенно понять состояние юзера в тот момент времени
    balanceAfter: { type: Number, required: true },
    frozenAfter: { type: Number, required: true },

    reason: { type: String },
  },
  { timestamps: true },
);

// Индекс, чтобы быстро показать историю кошелька юзеру
transactionSchema.index({ userId: 1, createdAt: -1 });

export type ITransaction = InferSchemaType<typeof transactionSchema>;
export const Transaction = mongoose.model("Transaction", transactionSchema);
