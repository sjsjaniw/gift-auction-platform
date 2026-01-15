import { Router } from "express";
import * as AuctionController from "./controllers/auction.controller";
import * as BidController from "./controllers/bid.controller";
import * as UserController from "./controllers/user.controller";
import * as AdminController from "./controllers/admin.controller";

const router = Router();

// Аукционы
router.get("/auctions", AuctionController.getAuctionsList);
router.post("/auctions", AuctionController.createAuction);
router.get("/auction/:id", AuctionController.getAuctionState);

// Ставки
router.post("/bid", BidController.makeBid); // <-- Теперь берем из BidController

// Пользователь
router.get("/user/:id", UserController.getUserInfo); // <-- Из UserController
router.get("/user/:id/inventory", UserController.getUserInventory);
router.post("/user/:id/faucet", UserController.claimFaucet);
router.post("/admin/reset", AdminController.resetAndStartDemo);

export default router;
