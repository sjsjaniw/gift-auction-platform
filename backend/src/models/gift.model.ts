import mongoose, { InferSchemaType } from "mongoose";

const giftSchema = new mongoose.Schema(
  {
    // Связь с аукционом (откуда родом)
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auction",
      required: true,
    },

    // Владелец (null, пока лежит на складе аукциона)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Уникальный номер в серии (№1, №2...)
    serialNumber: { type: Number, required: true },

    // Описание актива (чтобы рисовать их в профиле красиво)
    assetName: { type: String, required: true }, // Напр: "Blue Star"
    assetSymbol: { type: String, default: "⭐️" }, // Напр: "🏆" или url картинки
    assetColor: { type: String, default: "#007aff" }, // CSS цвет фона

    // Статусы
    // AVAILABLE - ждет розыгрыша
    // SOLD - выдан пользователю
    status: { type: String, enum: ["AVAILABLE", "SOLD"], default: "AVAILABLE" },

    // История (за сколько и когда куплен)
    purchasePrice: { type: Number },
    wonInRound: { type: Number },
  },
  { timestamps: true },
);

// Уникальность: В одном аукционе не может быть двух подарков №1
giftSchema.index({ auctionId: 1, serialNumber: 1 }, { unique: true });

// Индекс для быстрого поиска "Моих подарков" в профиле
giftSchema.index({ ownerId: 1 });

export type IGift = InferSchemaType<typeof giftSchema>;
export const Gift = mongoose.model("Gift", giftSchema);
