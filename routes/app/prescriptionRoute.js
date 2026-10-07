const { Router } = require("express");
const {
  uploadPrescription,
  updatePrescription,
  getPrescriptionByRequest,
  getMyPrescriptions,
  cancelPrescription,
  getPharmacistPrescriptions,
  acceptPrescription,
  rejectPrescription,
  uploadProviderPrescription,
  updateProviderPrescription,
} = require("../../controllers/app/prescriptionController");
const {
  uploadPrescription: uploadMiddleware,
} = require("../../middlewares/uploadPrescription");
const {
  tokenAuthMiddleware,
  checkUser,
} = require("../../middlewares/authMiddleware");

const prescriptionRouter = Router();

function handleMulterError(err, req, res, next) {
  if (!err) {
    next();
    return;
  }
  if (err instanceof Error && err.message) {
    return res.status(400).json({ message: err.message });
  }
  return res.status(400).json({ message: "Invalid prescription upload." });
}

// ── Provider clinical prescription routes (before /:id) ───────────────────────
prescriptionRouter.post(
  "/provider",
  tokenAuthMiddleware,
  checkUser,
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => handleMulterError(err, req, res, next));
  },
  uploadProviderPrescription,
);

prescriptionRouter.patch(
  "/provider/:id",
  tokenAuthMiddleware,
  checkUser,
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => handleMulterError(err, req, res, next));
  },
  updateProviderPrescription,
);

// ── Patient routes ────────────────────────────────────────────────────────────
prescriptionRouter.post(
  "/",
  tokenAuthMiddleware,
  checkUser,
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => handleMulterError(err, req, res, next));
  },
  uploadPrescription,
);

prescriptionRouter.patch(
  "/:id",
  tokenAuthMiddleware,
  checkUser,
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => handleMulterError(err, req, res, next));
  },
  updatePrescription,
);

prescriptionRouter.get(
  "/by-request/:requestId",
  tokenAuthMiddleware,
  checkUser,
  getPrescriptionByRequest,
);

prescriptionRouter.get(
  "/mine",
  tokenAuthMiddleware,
  checkUser,
  getMyPrescriptions,
);

prescriptionRouter.patch(
  "/:id/cancel",
  tokenAuthMiddleware,
  checkUser,
  cancelPrescription,
);

// ── Pharmacist routes ─────────────────────────────────────────────────────────
prescriptionRouter.get(
  "/pharmacist/all",
  tokenAuthMiddleware,
  checkUser,
  getPharmacistPrescriptions,
);

prescriptionRouter.patch(
  "/:id/accept",
  tokenAuthMiddleware,
  checkUser,
  acceptPrescription,
);

prescriptionRouter.patch(
  "/:id/reject",
  tokenAuthMiddleware,
  checkUser,
  rejectPrescription,
);

module.exports = prescriptionRouter;
