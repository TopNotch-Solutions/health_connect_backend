const { Router } = require("express");
const { getCallAccess } = require("../../controllers/app/teleconsultationController");
const { tokenAuthMiddleware, checkUser } = require("../../middlewares/authMiddleware");

const teleconsultationRouter = Router();

teleconsultationRouter.get(
  "/call-access/:requestId",
  tokenAuthMiddleware,
  checkUser,
  getCallAccess,
);

module.exports = teleconsultationRouter;
