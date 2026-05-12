const mongoose = require("mongoose");

const prescriptionSchema = new mongoose.Schema(
  {
    // Links prescription to the consultation request
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConsultationRequest",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    // Set when a pharmacist accepts the prescription
    pharmacistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: false,
      default: null,
    },
    // Stored filename (in public/images)
    prescriptionImage: {
      type: String,
      required: false,
      default: null,
    },
    // 'image' for jpeg/png, 'pdf' for pdf
    fileType: {
      type: String,
      enum: ["image", "pdf"],
      required: false,
      default: null,
    },
    // Lifecycle of the prescription
    status: {
      type: String,
      enum: [
        "pending_review",  // Uploaded by patient, awaiting pharmacist review
        "accepted",        // Pharmacist accepted — delivery starts
        "rejected",        // Pharmacist rejected — patient can re-upload or cancel
        "cancelled",       // Patient cancelled the whole request
      ],
      default: "pending_review",
    },
    // Optional note from pharmacist on rejection
    rejectionReason: {
      type: String,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

prescriptionSchema.index({ requestId: 1 }, { unique: true });
prescriptionSchema.index({ patientId: 1, status: 1 });
prescriptionSchema.index({ pharmacistId: 1, status: 1 });

const Prescription = mongoose.model("Prescription", prescriptionSchema);
module.exports = Prescription;
