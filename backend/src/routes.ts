import { Router } from "express";
import * as AuctionController from "./controllers/auction.controller";
import * as BidController from "./controllers/bid.controller";
import * as UserController from "./controllers/user.controller";
import * as AdminController from "./controllers/admin.controller";

const router = Router();

router.get("/auctions", AuctionController.getAuctionsList);
router.post("/auctions", AuctionController.createAuction);
router.get("/auction/:id", AuctionController.getAuctionState);

router.post("/bid", BidController.makeBid);

router.get("/user/:id", UserController.getUserInfo);
router.get("/user/:id/inventory", UserController.getUserInventory);
router.post("/user/:id/faucet", UserController.claimFaucet);
router.post("/admin/reset", AdminController.resetAndStartDemo);

export default router;
