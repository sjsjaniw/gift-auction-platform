import mongoose, { InferSchemaType, Model } from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, select: false }, // select: false чтобы случайно не вернуть его в API

    // Telegram Stars (целые числа)
    balance: { type: Number, required: true, default: 0, min: 0 },

    // Деньги, заблокированные в активных ставках
    frozenBalance: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export type IUser = InferSchemaType<typeof userSchema>;
export const User = mongoose.model("User", userSchema);
