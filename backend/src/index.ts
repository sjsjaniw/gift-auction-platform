import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { redisClient } from "./config/redis";
import router from "./routes";
import { startAuctionWorker } from "./workers/auction.worker";
import { logger } from "./utils/logger";
import { httpLogger } from "./middleware/httpLogger";
import { initSocket } from "./socket";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

interface SystemError extends Error {
  code?: string;
  syscall?: string;
}

let isShuttingDown = false;
const PORT = process.env.PORT || 3000;

const app = express();
const frontendPath = path.join(__dirname, "../../frontend");

const httpServer = createServer(app);
const io = initSocket(httpServer);

app.use((req: Request, _res: Response, next: NextFunction) => {
  req.io = io;
  next();
});

app.use(express.json());
app.use(httpLogger);
app.use("/api", router);

app.use(express.static(frontendPath));

app.get(/.*/, (req: Request, res: Response, _next: NextFunction) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API Endpoint not found" });
  }
  res.sendFile(path.join(frontendPath, "index.html"), (err: unknown) => {
    if (err) {
      const sysErr = err as SystemError;
      if (res.headersSent) return;
      res.status(500).send("Frontend not found. Did you run build?");
      logger.error("SendFile error", sysErr);
    }
  });
});

io.on("connection", (socket) => {
  logger.info("Client connected", { socketId: socket.id });

  socket.on("joinAuction", (auctionId: string) => {
    socket.join(auctionId);
    logger.debug(`User joined room`, { socketId: socket.id, auctionId });
  });
});

const start = async () => {
  try {
    await connectDB();

    startAuctionWorker();

    httpServer.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", err);
    process.exit(1);
  }
};

start();

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`\nShutting down gracefully (${signal})...`);

  try {
    await new Promise<void>((resolve, reject) => {
      if (!httpServer.listening) {
        logger.info("HTTP server was not running");
        return resolve();
      }

      httpServer.close((err) => {
        const sysErr = err as SystemError;
        if (sysErr && sysErr.code !== "ERR_SERVER_NOT_RUNNING") {
          return reject(sysErr);
        }
        logger.info("HTTP server closed");
        resolve();
      });
    });

    if (redisClient.status === "ready" || redisClient.status === "connecting") {
      await redisClient.quit();
      logger.info("Redis disconnected");
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info("MongoDB disconnected");
    }
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
