import { Server } from "socket.io";

declare global {
  namespace Express {
    interface Request {
      io: Server;
    }
  }

  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      MONGO_URI?: string;
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      NODE_ENV?: "development" | "production";
    }
  }
}
