import mongoose, { InferSchemaType } from "mongoose";

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
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ["DEPOSIT", "BID_FREEZE", "BID_UNFREEZE", "BID_PAYMENT"],
      required: true,
    },
    balanceAfter: { type: Number, required: true },
    frozenAfter: { type: Number, required: true },
    reason: { type: String },
  },
  { timestamps: true },
);

transactionSchema.index({ userId: 1, createdAt: -1 });

export type ITransaction = InferSchemaType<typeof transactionSchema>;
export const Transaction = mongoose.model("Transaction", transactionSchema);
