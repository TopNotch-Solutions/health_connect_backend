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
} = require("../../controllers/app/prescriptionController");
const { uploadPrescription: uploadMiddleware } = require("../../middlewares/uploadPrescription");
const { tokenAuthMiddleware, checkUser } = require("../../middlewares/authMiddleware");

const prescriptionRouter = Router();

// ── Patient routes ────────────────────────────────────────────────────────────
// Upload new prescription for a request
prescriptionRouter.post(
  "/",
  tokenAuthMiddleware,
  checkUser,
  uploadMiddleware,
  uploadPrescription
);

// Replace existing prescription image (edit while pending_review)
prescriptionRouter.patch(
  "/:id",
  tokenAuthMiddleware,
  checkUser,
  uploadMiddleware,
  updatePrescription
);

// Get prescription by requestId
prescriptionRouter.get(
  "/by-request/:requestId",
  tokenAuthMiddleware,
  checkUser,
  getPrescriptionByRequest
);

// Get all my prescriptions (patient)
prescriptionRouter.get(
  "/mine",
  tokenAuthMiddleware,
  checkUser,
  getMyPrescriptions
);

// Cancel prescription
prescriptionRouter.patch(
  "/:id/cancel",
  tokenAuthMiddleware,
  checkUser,
  cancelPrescription
);

// ── Pharmacist routes ─────────────────────────────────────────────────────────
// Get all prescriptions for review
prescriptionRouter.get(
  "/pharmacist/all",
  tokenAuthMiddleware,
  checkUser,
  getPharmacistPrescriptions
);

// Accept prescription → starts delivery
prescriptionRouter.patch(
  "/:id/accept",
  tokenAuthMiddleware,
  checkUser,
  acceptPrescription
);

// Reject prescription
prescriptionRouter.patch(
  "/:id/reject",
  tokenAuthMiddleware,
  checkUser,
  rejectPrescription
);

module.exports = prescriptionRouter;
