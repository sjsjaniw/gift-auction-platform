import { z } from "zod";

// RoundSchema остается как был...
const RoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  giftCount: z.number().int().positive(),
  durationSeconds: z.number().int().positive().default(300),
  endTime: z.string().or(z.date()).pipe(z.coerce.date()).optional(),
});

export const CreateAuctionSchema = z.object({
  title: z.string().min(3).max(100),
  startPrice: z.number().int().positive(),
  minStep: z.number().int().positive().default(1),
  totalQuantity: z.number().int().positive(),
  startTime: z.string().datetime().or(z.date()).pipe(z.coerce.date()),
  rounds: z.array(RoundSchema).min(1),
  assetName: z.string().min(1),
  assetSymbol: z.string().default("🎁"),
  assetColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default("#007aff"),

  // 👇 ДОБАВЛЯЕМ ЭТИ ПОЛЯ (чтобы скрипт симуляции не падал)
  status: z.enum(["PENDING", "ACTIVE", "FINISHED", "CANCELLED"]).optional(),
  currentRoundNumber: z.number().int().positive().optional(),
});

export type CreateAuctionDto = z.infer<typeof CreateAuctionSchema>;
