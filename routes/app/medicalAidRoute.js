const { Router } = require("express");
const {
  all,
  providerStats,
  providerConsultations,
  downloadClaimPdf,
  markClaimed,
} = require("../../controllers/app/medicalAidController");
const {
  tokenAuthMiddleware,
  checkUser,
} = require("../../middlewares/authMiddleware");

const medicalAidAppRouter = Router();

medicalAidAppRouter.get("/all", tokenAuthMiddleware, checkUser, all);
medicalAidAppRouter.get(
  "/provider-stats",
  tokenAuthMiddleware,
  checkUser,
  providerStats,
);
medicalAidAppRouter.get(
  "/consultations",
  tokenAuthMiddleware,
  checkUser,
  providerConsultations,
);
medicalAidAppRouter.get(
  "/consultations/:id/claim-pdf",
  tokenAuthMiddleware,
  checkUser,
  downloadClaimPdf,
);
medicalAidAppRouter.post(
  "/consultations/:id/mark-claimed",
  tokenAuthMiddleware,
  checkUser,
  markClaimed,
);

module.exports = medicalAidAppRouter;
