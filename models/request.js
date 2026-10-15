const mongoose = require("mongoose");

const consultationRequestSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: false, // null when searching for provider
    },
    ailmentCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AilmentCategory",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "searching", // Looking for available provider
        "pending", // Sent to specific provider, awaiting response
        "accepted", // Provider accepted
        "payment_pending", // Video consultation accepted, waiting for patient payment
        "paid", // Patient payment completed
        "provider_confirmation_pending", // Waiting for provider to confirm readiness
        "ready_for_call", // Both sides can enter the video room
        "in_call", // Video consultation is live
        "rejected", // Provider rejected
        "en_route", // Provider is on the way
        "arrived", // Provider has arrived
        "in_progress", // Consultation in progress
        "completed", // Consultation completed
        "cancelled", // Cancelled by patient
        "expired" // Request expired without acceptance
      ],
      default: "searching",
    },
    // Patient location details
    address: {
      route: { type: String, required: true }, // street
      locality: { type: String, required: true }, // city
      administrative_area_level_1: { type: String, required: true }, // region
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number], // [longitude, latitude] for GeoJSON
          default: [0, 0]
        }
      }
    },
    // Real-time location tracking
    locationTracking: {
      patientLocation: {
        latitude: { type: Number }, // same as address.coordinates.latitude
        longitude: { type: Number }, // same as address.coordinates.longitude
        lastUpdated: { type: Date },
      },
      providerLocation: {
        latitude: { type: Number },
        longitude: { type: Number },
        lastUpdated: { type: Date },
      }
    },
    // Additional patient information
    preferredTime: {
      type: Date,
      required: false,
    },
    consultationCost: {
      type: Number,
      required: true,
    },
    // Provider response details
    providerResponse: {
      responseTime: { type: Date },
      estimatedArrival: { type: String }, // "15 minutes", "30 minutes", etc.
    },
    consultationMode: {
      type: String,
      enum: ["house_visit", "video_consultation"],
      required: true,
      default: "house_visit",
    },
    // Payment details
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["wallet", "cash", "medical_aid"],
      default: "wallet",
    },
    // Medical aid payment details (required when paymentMethod is medical_aid)
    medicalAidDetails: {
      medicalAidId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MedicalAid",
      },
      medicalAidTitle: { type: String },
      medicalAidImage: { type: String },
      membershipNumber: { type: String },
      mainMemberName: { type: String },
      residentialAddress: { type: String },
      // Snapshot of Namibian postal address at time of request
      postalAddress: {
        addressee: { type: String },
        addressType: {
          type: String,
          enum: ["po_box", "private_bag", "street"],
        },
        boxNumber: { type: String },
        bagNumber: { type: String },
        unitOrAdditional: { type: String },
        premises: { type: String },
        subLocality: { type: String },
        locality: { type: String },
        postOffice: { type: String },
        postcode: { type: String },
        country: { type: String, default: "NAMIBIA" },
        formatted: { type: String },
      },
      icd10Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Icd10",
      },
      icd10Code: { type: String },
    },
    // Provider Namibian postal address snapshot (set when accepting medical_aid)
    providerPostalAddress: {
      addressee: { type: String },
      addressType: {
        type: String,
        enum: ["po_box", "private_bag", "street"],
      },
      boxNumber: { type: String },
      bagNumber: { type: String },
      unitOrAdditional: { type: String },
      premises: { type: String },
      subLocality: { type: String },
      locality: { type: String },
      postOffice: { type: String },
      postcode: { type: String },
      country: { type: String, default: "NAMIBIA" },
      formatted: { type: String },
    },
    // Medical aid claim download / collection audit (provider)
    medicalAidClaimDownload: {
      downloaded: { type: Boolean, default: false },
      downloadedAt: { type: Date },
      downloadCount: { type: Number, default: 0 },
      lastDownloadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
      // Provider marks claim as collected / submitted to medical aid
      claimed: { type: Boolean, default: false },
      claimedAt: { type: Date },
      claimedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    },
    // Track providers who have rejected this request (for 'searching' mode)
    rejectedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: [],
    }],
    // Timestamps for different stages
    timeline: {
      requested: { type: Date, default: Date.now },
      providerAssigned: { type: Date },
      providerAccepted: { type: Date },
      paymentConfirmed: { type: Date },
      providerConfirmed: { type: Date },
      callStarted: { type: Date },
      providerEnRoute: { type: Date },
      providerArrived: { type: Date },
      consultationStarted: { type: Date },
      consultationCompleted: { type: Date },
    },
    // Cancellation details
    cancellation: {
      cancelledBy: { 
        type: String, 
        enum: ["patient", "provider", "system"],
      },
      reason: { type: String },
      cancelledAt: { type: Date },
      refundAmount: { type: Number, default: 0 },
    },
    // Request expiration timestamp (for reference, but no auto-deletion)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from creation for reference only
    }
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
consultationRequestSchema.index({ patientId: 1, status: 1 });
consultationRequestSchema.index({ providerId: 1, status: 1 });
consultationRequestSchema.index({ status: 1, createdAt: -1 });
consultationRequestSchema.index({ "address.coordinates": "2dsphere" }); // For geospatial queries with GeoJSON

// Pre-save middleware to update timeline
consultationRequestSchema.pre("save", function(next) {
  if (this.isModified("status")) {
    if (!this.timeline) {
      this.timeline = {};
    }
    const now = new Date();
    switch (this.status) {
      case "accepted":
      case "payment_pending":
        this.timeline.providerAccepted = now;
        break;
      case "paid":
        this.timeline.paymentConfirmed = now;
        break;
      case "ready_for_call":
        this.timeline.providerConfirmed = now;
        break;
      case "in_call":
        this.timeline.callStarted = now;
        // Preserve original start if consultation was already started
        if (!this.timeline.consultationStarted) {
          this.timeline.consultationStarted = now;
        }
        break;
      case "en_route":
        this.timeline.providerEnRoute = now;
        break;
      case "arrived":
        this.timeline.providerArrived = now;
        break;
      case "in_progress":
        if (!this.timeline.consultationStarted) {
          this.timeline.consultationStarted = now;
        }
        break;
      case "completed":
        this.timeline.consultationCompleted = now;
        // House visits can jump arrived → completed; ensure TIME IN is set
        if (!this.timeline.consultationStarted) {
          this.timeline.consultationStarted =
            this.timeline.callStarted ||
            this.timeline.providerArrived ||
            this.timeline.providerEnRoute ||
            now;
        }
        break;
    }
    // Nested timeline paths are not always auto-tracked — force persistence
    this.markModified("timeline");
  }
  next();
});

const ConsultationRequest = mongoose.model("ConsultationRequest", consultationRequestSchema)

module.exports = ConsultationRequest;
