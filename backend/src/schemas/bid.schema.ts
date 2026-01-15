import { z } from "zod";
import mongoose from "mongoose";

// Кастомная проверка на ObjectId
const ObjectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ObjectId",
  });

export const PlaceBidSchema = z.object({
  auctionId: ObjectIdSchema,
  amount: z.number().int().positive(),
});

export type PlaceBidDto = z.infer<typeof PlaceBidSchema>;
