import mongoose, { InferSchemaType } from "mongoose";

const giftSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auction",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    serialNumber: { type: Number, required: true },
    assetName: { type: String, required: true },
    assetSymbol: { type: String, default: "⭐️" },
    assetColor: { type: String, default: "#007aff" },
    status: { type: String, enum: ["AVAILABLE", "SOLD"], default: "AVAILABLE" },
    purchasePrice: { type: Number },
    wonInRound: { type: Number },
  },
  { timestamps: true },
);

giftSchema.index({ auctionId: 1, serialNumber: 1 }, { unique: true });
giftSchema.index({ ownerId: 1 });

export type IGift = InferSchemaType<typeof giftSchema>;
export const Gift = mongoose.model("Gift", giftSchema);
