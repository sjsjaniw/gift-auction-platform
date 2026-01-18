import mongoose from "mongoose";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

export const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not defined in .env");

    await mongoose.connect(uri);
    logger.info("MongoDB Connected (Transaction Ready)");
  } catch (error) {
    logger.error("MongoDB Connection Error:", error);
    process.exit(1);
  }
};
