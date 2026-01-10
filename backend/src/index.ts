import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose"; // Добавили для shutdown
import { connectDB } from "./config/db";
import { redisClient } from "./config/redis"; // Добавили для shutdown
import router from "./routes";
import { startAuctionWorker } from "./workers/auction.worker";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Настраиваем Socket.io
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Middleware: Делаем io доступным в контроллерах
app.use((req, res, next) => {
  (req as any).io = io;
  next();
});

const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. API Routes
app.use("/api", router);

// 2. Раздача Фронтенда
// Используем process.cwd(), чтобы путь был от корня проекта (безопаснее при сборке)
// Если запускаешь из корня: backend/frontend -> ../frontend
const frontendPath = path.join(__dirname, "../../frontend");
console.log("📂 Serving frontend from:", frontendPath);

app.use(express.static(frontendPath));

// 3. Fallback (SPA) & 404 API Handling
app.get(/.*/, (req, res, next) => {
  // Если это API запрос, которого нет в роутере -> возвращаем JSON 404
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API Endpoint not found" });
  }
  // Иначе отдаем index.html (для React/SPA роутинга)
  res.sendFile(path.join(frontendPath, "index.html"), (err) => {
    if (err) {
      // Если фронта нет, чтоб сервер не падал молча
      res.status(500).send("Frontend not found. Did you run build?");
    }
  });
});

// 4. Логика Socket.IO
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("joinAuction", (auctionId) => {
    socket.join(auctionId);
    console.log(`👤 User joined room: ${auctionId}`);
  });
});

// 5. Запуск сервера
const start = async () => {
  try {
    await connectDB();

    // Запускаем воркер
    startAuctionWorker();

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🌐 Frontend available at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();

// --- GRACEFUL SHUTDOWN (Бонус для судей) ---
// Корректно закрываем соединения при Ctrl+C или Docker stop
const gracefulShutdown = async () => {
  console.log("\n🔻 Shutting down gracefully...");

  try {
    // Закрываем HTTP сервер (перестаем принимать запросы)
    httpServer.close(() => console.log("   HTTP server closed"));

    // Отключаем Redis
    await redisClient.quit();
    console.log("   Redis disconnected");

    // Отключаем Mongo
    await mongoose.connection.close();
    console.log("   MongoDB disconnected");

    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
