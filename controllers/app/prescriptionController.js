const path = require("path");
const fs = require("fs");
const Prescription = require("../../models/prescription");
const ConsultationRequest = require("../../models/request");
const User = require("../../models/user");
const Notification = require("../../models/notification");
const { sendPushToAppUser } = require("../../utils/pushNotifications");

const PROVIDER_ISSUED_ACTIVE_STATUSES = [
  "arrived",
  "in_progress",
  "in_call",
];

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Helper: delete old image file
function deleteFile(filename) {
  if (!filename) return;
  try {
    const filePath = path.join(__dirname, "../../public/images", filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("Could not delete old prescription file:", e.message);
  }
}

// Helper: derive fileType from filename
function getFileType(filename) {
  if (!filename) return null;
  const ext = path.extname(filename).toLowerCase();
  return ext === ".pdf" ? "pdf" : "image";
}

function canIssuePrescription(user) {
  if (!user) return false;
  if (user.role === "doctor") return true;
  if (user.role === "nurse" && user.dispensingCertificateLicence) return true;
  return false;
}

function getRequestCompletedAt(request) {
  if (request?.timeline?.consultationCompleted) {
    return new Date(request.timeline.consultationCompleted);
  }
  if (request?.updatedAt) {
    return new Date(request.updatedAt);
  }
  return null;
}

function canEditProviderPrescription(request) {
  if (!request) {
    return { allowed: false, reason: "Request not found." };
  }

  if (PROVIDER_ISSUED_ACTIVE_STATUSES.includes(request.status)) {
    return { allowed: true };
  }

  if (request.status === "completed") {
    const completedAt = getRequestCompletedAt(request);
    if (!completedAt || Number.isNaN(completedAt.getTime())) {
      return {
        allowed: false,
        reason:
          "Consultation completion time is missing. Prescription can no longer be updated.",
      };
    }
    const deadline = completedAt.getTime() + EDIT_WINDOW_MS;
    if (Date.now() <= deadline) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        "The 24-hour window to upload or update a prescription after consultation completion has expired.",
    };
  }

  return {
    allowed: false,
    reason:
      "Prescriptions can only be uploaded during an active consultation or within 24 hours after completion.",
  };
}

async function notifyPatientOfProviderPrescription({
  patientId,
  prescriptionId,
  requestId,
  isUpdate,
}) {
  const patient = await User.findById(patientId).select(
    "expoPushToken fullname",
  );
  if (!patient) return;

  const title = isUpdate ? "Prescription Updated" : "Prescription Available";
  const message = isUpdate
    ? "Your healthcare provider updated your prescription. You can download it in the app."
    : "Your healthcare provider uploaded a prescription. You can download it in the app.";

  try {
    await Notification.create({
      userId: patientId,
      type: "alert",
      title,
      message,
      status: "sent",
      channels: { inApp: true, push: true, email: false, sms: false },
      priority: "high",
      scheduledFor: new Date(),
      sentAt: new Date(),
      data: {
        prescriptionId,
        requestId: requestId ? String(requestId) : "",
      },
    });
  } catch (err) {
    console.error("Error creating provider prescription notification:", err);
  }

  await sendPushToAppUser(patient, title, message, {
    prescriptionId: String(prescriptionId),
    requestId: requestId ? String(requestId) : "",
  });
}

// PATIENT - Upload prescription for a request
// POST /api/app/prescription
// Body (multipart): requestId, prescriptionImage (file)
exports.uploadPrescription = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { requestId } = req.body;
    const file = req.file;

    if (!requestId) {
      if (file) deleteFile(file.filename);
      return res.status(400).json({ message: "requestId is required." });
    }
    if (!file) {
      return res.status(400).json({ message: "Prescription file is required." });
    }

    // Verify the request belongs to this patient
    const request = await ConsultationRequest.findById(requestId);
    if (!request) {
      deleteFile(file.filename);
      return res.status(404).json({ message: "Request not found." });
    }
    if (!request.patientId || request.patientId.toString() !== patientId.toString()) {
      deleteFile(file.filename);
      return res.status(403).json({ message: "Not authorised for this request." });
    }

    // One prescription per request - upsert
    const existing = await Prescription.findOne({ requestId });
    if (existing) {
      if (existing.source === "provider_issued") {
        deleteFile(file.filename);
        return res.status(400).json({
          message:
            "A provider-issued prescription already exists for this consultation.",
        });
      }
      // Only allow re-upload if still pending_review
      if (existing.status !== "pending_review") {
        deleteFile(file.filename);
        return res.status(400).json({
          message: "Cannot replace prescription once it is " + existing.status + ".",
        });
      }
      // Delete old file and replace
      deleteFile(existing.prescriptionImage);
      existing.prescriptionImage = file.filename;
      existing.fileType = getFileType(file.filename);
      existing.source = "patient_pharmacy";
      await existing.save();
      return res.status(200).json({
        message: "Prescription updated successfully.",
        prescription: existing,
      });
    }

    const prescription = await Prescription.create({
      requestId,
      patientId,
      prescriptionImage: file.filename,
      fileType: getFileType(file.filename),
      status: "pending_review",
      source: "patient_pharmacy",
    });

    return res.status(201).json({
      message: "Prescription uploaded successfully.",
      prescription,
    });
  } catch (err) {
    console.error("uploadPrescription error:", err);
    if (req.file) deleteFile(req.file.filename);
    return res.status(500).json({ message: "Server error." });
  }
};

// PATIENT - Replace prescription image (edit)
// PATCH /api/app/prescription/:id
// Body (multipart): prescriptionImage (file)
exports.updatePrescription = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Prescription file is required." });
    }

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      deleteFile(file.filename);
      return res.status(404).json({ message: "Prescription not found." });
    }
    if (prescription.source === "provider_issued") {
      deleteFile(file.filename);
      return res.status(403).json({
        message: "Provider-issued prescriptions cannot be edited by patients.",
      });
    }
    if (!prescription.patientId || prescription.patientId.toString() !== patientId.toString()) {
      deleteFile(file.filename);
      return res.status(403).json({ message: "Not authorised." });
    }
    if (prescription.status !== "pending_review") {
      deleteFile(file.filename);
      return res.status(400).json({
        message: "Cannot edit prescription once it is " + prescription.status + ".",
      });
    }

    deleteFile(prescription.prescriptionImage);
    prescription.prescriptionImage = file.filename;
    prescription.fileType = getFileType(file.filename);
    await prescription.save();

    return res.status(200).json({
      message: "Prescription updated successfully.",
      prescription,
    });
  } catch (err) {
    console.error("updatePrescription error:", err);
    if (req.file) deleteFile(req.file.filename);
    return res.status(500).json({ message: "Server error." });
  }
};

// PATIENT or assigned PROVIDER - Get prescription by requestId
// GET /api/app/prescription/by-request/:requestId
exports.getPrescriptionByRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.params;

    const request = await ConsultationRequest.findById(requestId).select(
      "patientId providerId",
    );
    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    const isPatient =
      request.patientId && request.patientId.toString() === userId.toString();
    const isAssignedProvider =
      request.providerId && request.providerId.toString() === userId.toString();

    if (!isPatient && !isAssignedProvider) {
      return res.status(403).json({ message: "Not authorised." });
    }

    const prescription = await Prescription.findOne({ requestId })
      .populate("issuerId", "fullname role")
      .populate("pharmacistId", "fullname role");

    if (!prescription) {
      return res
        .status(404)
        .json({ message: "No prescription found for this request." });
    }

    return res.status(200).json({ prescription });
  } catch (err) {
    console.error("getPrescriptionByRequest error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// PATIENT - Get all my prescriptions
// GET /api/app/prescription/mine
exports.getMyPrescriptions = async (req, res) => {
  try {
    const patientId = req.user.id;
    const prescriptions = await Prescription.find({ patientId })
      .populate("requestId", "status ailmentCategoryId createdAt")
      .populate("issuerId", "fullname role")
      .sort({ createdAt: -1 });
    return res.status(200).json({ prescriptions });
  } catch (err) {
    console.error("getMyPrescriptions error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// PATIENT - Cancel prescription
// PATCH /api/app/prescription/:id/cancel
exports.cancelPrescription = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { id } = req.params;

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found." });
    }
    if (prescription.source === "provider_issued") {
      return res.status(403).json({
        message: "Provider-issued prescriptions cannot be cancelled by patients.",
      });
    }
    if (!prescription.patientId || prescription.patientId.toString() !== patientId.toString()) {
      return res.status(403).json({ message: "Not authorised." });
    }
    if (prescription.status === "cancelled") {
      return res.status(400).json({ message: "Prescription is already cancelled." });
    }

    prescription.status = "cancelled";
    await prescription.save();

    return res.status(200).json({ message: "Prescription cancelled.", prescription });
  } catch (err) {
    console.error("cancelPrescription error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// PROVIDER - Upload clinical prescription for an assigned request
// POST /api/app/prescription/provider
exports.uploadProviderPrescription = async (req, res) => {
  try {
    const providerId = req.user.id;
    const { requestId } = req.body;
    const file = req.file;

    if (!requestId) {
      if (file) deleteFile(file.filename);
      return res.status(400).json({ message: "requestId is required." });
    }
    if (!file) {
      return res.status(400).json({ message: "Prescription file is required." });
    }

    const provider = await User.findById(providerId).select(
      "role dispensingCertificateLicence fullname",
    );
    if (!canIssuePrescription(provider)) {
      deleteFile(file.filename);
      return res.status(403).json({
        message:
          "Only doctors and prescribing nurses may upload clinical prescriptions.",
      });
    }

    const request = await ConsultationRequest.findById(requestId);
    if (!request) {
      deleteFile(file.filename);
      return res.status(404).json({ message: "Request not found." });
    }
    if (!request.providerId || request.providerId.toString() !== providerId.toString()) {
      deleteFile(file.filename);
      return res.status(403).json({
        message: "You are not assigned to this consultation request.",
      });
    }

    const windowCheck = canEditProviderPrescription(request);
    if (!windowCheck.allowed) {
      deleteFile(file.filename);
      return res.status(400).json({ message: windowCheck.reason });
    }

    const existing = await Prescription.findOne({ requestId });
    if (existing) {
      if (existing.source === "patient_pharmacy") {
        deleteFile(file.filename);
        return res.status(400).json({
          message:
            "A pharmacy prescription already exists for this request. Use a different consultation.",
        });
      }

      // Treat as update if provider_issued already exists
      deleteFile(existing.prescriptionImage);
      existing.prescriptionImage = file.filename;
      existing.fileType = getFileType(file.filename);
      existing.issuerId = providerId;
      existing.status = "issued";
      existing.source = "provider_issued";
      await existing.save();

      await notifyPatientOfProviderPrescription({
        patientId: existing.patientId,
        prescriptionId: existing._id,
        requestId: request._id,
        isUpdate: true,
      });

      return res.status(200).json({
        message: "Prescription updated successfully.",
        prescription: existing,
      });
    }

    const prescription = await Prescription.create({
      requestId,
      patientId: request.patientId,
      issuerId: providerId,
      prescriptionImage: file.filename,
      fileType: getFileType(file.filename),
      status: "issued",
      source: "provider_issued",
    });

    await notifyPatientOfProviderPrescription({
      patientId: request.patientId,
      prescriptionId: prescription._id,
      requestId: request._id,
      isUpdate: false,
    });

    return res.status(201).json({
      message: "Prescription uploaded successfully.",
      prescription,
    });
  } catch (err) {
    console.error("uploadProviderPrescription error:", err);
    if (req.file) deleteFile(req.file.filename);
    return res.status(500).json({ message: "Server error." });
  }
};

// PROVIDER - Replace clinical prescription within edit window
// PATCH /api/app/prescription/provider/:id
exports.updateProviderPrescription = async (req, res) => {
  try {
    const providerId = req.user.id;
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Prescription file is required." });
    }

    const provider = await User.findById(providerId).select(
      "role dispensingCertificateLicence",
    );
    if (!canIssuePrescription(provider)) {
      deleteFile(file.filename);
      return res.status(403).json({
        message:
          "Only doctors and prescribing nurses may update clinical prescriptions.",
      });
    }

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      deleteFile(file.filename);
      return res.status(404).json({ message: "Prescription not found." });
    }
    if (prescription.source !== "provider_issued") {
      deleteFile(file.filename);
      return res.status(400).json({
        message: "Only provider-issued prescriptions can be updated here.",
      });
    }

    const request = await ConsultationRequest.findById(prescription.requestId);
    if (!request) {
      deleteFile(file.filename);
      return res.status(404).json({ message: "Request not found." });
    }
    if (!request.providerId || request.providerId.toString() !== providerId.toString()) {
      deleteFile(file.filename);
      return res.status(403).json({
        message: "You are not assigned to this consultation request.",
      });
    }

    const windowCheck = canEditProviderPrescription(request);
    if (!windowCheck.allowed) {
      deleteFile(file.filename);
      return res.status(400).json({ message: windowCheck.reason });
    }

    deleteFile(prescription.prescriptionImage);
    prescription.prescriptionImage = file.filename;
    prescription.fileType = getFileType(file.filename);
    prescription.issuerId = providerId;
    prescription.status = "issued";
    await prescription.save();

    await notifyPatientOfProviderPrescription({
      patientId: prescription.patientId,
      prescriptionId: prescription._id,
      requestId: request._id,
      isUpdate: true,
    });

    return res.status(200).json({
      message: "Prescription updated successfully.",
      prescription,
    });
  } catch (err) {
    console.error("updateProviderPrescription error:", err);
    if (req.file) deleteFile(req.file.filename);
    return res.status(500).json({ message: "Server error." });
  }
};

// PHARMACIST - Get all prescriptions assigned to me + all pending_review
// GET /api/app/prescription/pharmacist/all
exports.getPharmacistPrescriptions = async (req, res) => {
  try {
    const pharmacistId = req.user.id;

    const prescriptions = await Prescription.find({
      source: { $ne: "provider_issued" },
      $or: [
        { status: "pending_review" },
        { pharmacistId },
      ],
    })
      .populate("patientId", "fullname cellphoneNumber profileImage")
      .populate({
        path: "requestId",
        select: "status ailmentCategoryId address createdAt consultationCost",
        populate: { path: "ailmentCategoryId", select: "title provider requiresPrescription" },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({ prescriptions });
  } catch (err) {
    console.error("getPharmacistPrescriptions error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// PHARMACIST - Accept prescription
// PATCH /api/app/prescription/:id/accept
exports.acceptPrescription = async (req, res) => {
  try {
    const pharmacistId = req.user.id;
    const { id } = req.params;

    const prescription = await Prescription.findById(id).populate("requestId");
    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found." });
    }
    if (prescription.source === "provider_issued") {
      return res.status(400).json({
        message: "Provider-issued prescriptions are not reviewed by pharmacists.",
      });
    }
    if (prescription.status !== "pending_review") {
      return res.status(400).json({
        message: "Prescription is already " + prescription.status + ".",
      });
    }
    if (!prescription.prescriptionImage) {
      return res.status(400).json({
        message: "Patient has not uploaded a prescription image yet.",
      });
    }

    // Update prescription
    prescription.status = "accepted";
    prescription.pharmacistId = pharmacistId;
    await prescription.save();

    // Update the linked request: assign pharmacist + move to accepted
    const request = prescription.requestId;
    if (request) {
      request.providerId = pharmacistId;
      request.status = "accepted";
      request.providerResponse = {
        responseTime: new Date(),
        estimatedArrival: "30 minutes",
      };
      await request.save();
    }

    // Notify patient
    const patient = await User.findById(prescription.patientId).select(
      "expoPushToken fullname",
    );
    if (patient) {
      await Notification.create({
        userId: prescription.patientId,
        type: "alert",
        title: "Prescription Accepted",
        message: "Your prescription has been reviewed and accepted. Your pharmacist is preparing your medication for delivery.",
        status: "sent",
        channels: { inApp: true, push: true, email: false, sms: false },
        priority: "high",
        scheduledFor: new Date(),
        sentAt: new Date(),
      });
      await sendPushToAppUser(
        patient,
        "Prescription Accepted",
        "Your prescription has been accepted. Medication delivery is on the way.",
        {
          prescriptionId: id,
          requestId: request ? String(request._id) : "",
        },
      );
    }

    return res.status(200).json({
      message: "Prescription accepted. Delivery process started.",
      prescription,
    });
  } catch (err) {
    console.error("acceptPrescription error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// PHARMACIST - Reject prescription
// PATCH /api/app/prescription/:id/reject
// Body: { reason? }
exports.rejectPrescription = async (req, res) => {
  try {
    const pharmacistId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const prescription = await Prescription.findById(id).populate("requestId");
    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found." });
    }
    if (prescription.source === "provider_issued") {
      return res.status(400).json({
        message: "Provider-issued prescriptions are not reviewed by pharmacists.",
      });
    }
    if (prescription.status !== "pending_review") {
      return res.status(400).json({
        message: "Prescription is already " + prescription.status + ".",
      });
    }

    // Temporarily mark rejected so we can save pharmacistId + reason for notification
    prescription.status = "rejected";
    prescription.pharmacistId = pharmacistId;
    prescription.rejectionReason = reason || null;
    await prescription.save();

    // Notify patient so they can re-upload
    const patient = await User.findById(prescription.patientId).select(
      "expoPushToken fullname",
    );
    if (patient) {
      const reasonText = reason ? " Reason: " + reason : "";
      await Notification.create({
        userId: prescription.patientId,
        type: "alert",
        title: "Prescription Rejected",
        message: "Your prescription was rejected." + reasonText + " Please upload a clearer image or valid prescription.",
        status: "sent",
        channels: { inApp: true, push: true, email: false, sms: false },
        priority: "high",
        scheduledFor: new Date(),
        sentAt: new Date(),
      });
      await sendPushToAppUser(
        patient,
        "Prescription Rejected",
        "Your prescription was rejected." + reasonText,
        { prescriptionId: id },
      );
    }

    // Reset so patient can re-upload
    prescription.status = "pending_review";
    prescription.prescriptionImage = null;
    prescription.fileType = null;
    prescription.pharmacistId = null;
    prescription.rejectionReason = reason || null;
    await prescription.save();

    return res.status(200).json({
      message: "Prescription rejected. Patient has been notified to re-upload.",
      prescription,
    });
  } catch (err) {
    console.error("rejectPrescription error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};
