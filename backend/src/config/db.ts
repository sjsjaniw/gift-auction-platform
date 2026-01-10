import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    // FIX: Если URI нет, кидаем ошибку раньше, чем передаем в connect
    if (!uri) throw new Error("MONGO_URI is not defined in .env");

    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected (Transaction Ready)");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};
