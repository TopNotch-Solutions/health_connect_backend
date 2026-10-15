const { Router } = require("express");
const {
  getMine,
  upsertMine,
} = require("../../controllers/app/postalAddressController");
const {
  tokenAuthMiddleware,
  checkUser,
} = require("../../middlewares/authMiddleware");

const postalAddressAppRouter = Router();

postalAddressAppRouter.get("/", tokenAuthMiddleware, checkUser, getMine);
postalAddressAppRouter.put("/", tokenAuthMiddleware, checkUser, upsertMine);

module.exports = postalAddressAppRouter;
