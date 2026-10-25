const { Router } = require("express");
const {
  all,
  providerStats,
  providerConsultations,
  downloadClaimPdf,
  downloadClaimPdfsBatch,
  markClaimed,
  archiveClaimed,
  unarchiveClaimed,
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
// Batch combined claim PDF (must be registered before :id route)
medicalAidAppRouter.post(
  "/consultations/claim-pdf",
  tokenAuthMiddleware,
  checkUser,
  downloadClaimPdfsBatch,
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
medicalAidAppRouter.post(
  "/consultations/:id/archive",
  tokenAuthMiddleware,
  checkUser,
  archiveClaimed,
);
medicalAidAppRouter.post(
  "/consultations/:id/unarchive",
  tokenAuthMiddleware,
  checkUser,
  unarchiveClaimed,
);

module.exports = medicalAidAppRouter;
