import mongoose, { InferSchemaType } from "mongoose";

const roundConfigSchema = new mongoose.Schema(
  {
    roundNumber: { type: Number, required: true },
    giftCount: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    endTime: { type: Date, required: true },
    isProcessed: { type: Boolean, default: false },
  },
  { _id: false },
);

const auctionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    startPrice: { type: Number, required: true, default: 100 },
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
