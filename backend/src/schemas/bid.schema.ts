import { z } from "zod";
import mongoose from "mongoose";

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
