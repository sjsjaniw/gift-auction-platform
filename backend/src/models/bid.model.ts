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
    status: {
      type: String,
      enum: ["ACTIVE", "WON", "REFUNDED"],
      default: "ACTIVE",
    },
    wonInRound: { type: Number },
  },
  { timestamps: true },
);

bidSchema.index(
  { auctionId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);

export type IBid = InferSchemaType<typeof bidSchema>;
export const Bid = mongoose.model("Bid", bidSchema);
