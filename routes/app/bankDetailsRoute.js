const { Router } = require("express");
const {
  getMine,
  upsertMine,
} = require("../../controllers/app/bankDetailsController");
const {
  tokenAuthMiddleware,
  checkUser,
} = require("../../middlewares/authMiddleware");

const bankDetailsAppRouter = Router();

bankDetailsAppRouter.get("/", tokenAuthMiddleware, checkUser, getMine);
bankDetailsAppRouter.put("/", tokenAuthMiddleware, checkUser, upsertMine);

module.exports = bankDetailsAppRouter;
