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
    urgency: {
      type: String,
      enum: ["low", "medium", "high", "emergency"],
      default: "medium",
    },
    // Patient location details
    address: {
      route: { type: String, required: true }, // street
      locality: { type: String, required: true }, // city
      administrative_area_level_1: { type: String, required: true }, // region
      coordinates: {
        latitude: { type: Number, required: true }, // geometry.location.lat - same as patientLocation.latitude
        longitude: { type: Number, required: true }, // geometry.location.lng - same as patientLocation.longitude
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
    symptoms: {
      type: String,
      required: false,
      maxLength: 500,
    },
    preferredTime: {
      type: Date,
      required: false,
    },
    estimatedCost: {
      type: String,
      required: true,
    },
    finalCost: {
      type: Number,
      required: false,
    },
    // Provider response details
    providerResponse: {
      responseTime: { type: Date },
      estimatedArrival: { type: String }, // "15 minutes", "30 minutes", etc.
    },
    // Consultation details
    consultationDetails: {
      startTime: { type: Date },
      endTime: { type: Date },
      notes: { type: String },
      diagnosis: { type: String },
      prescription: { type: String },
      followUpInstructions: { type: String },
      followUpDate: { type: Date },
    },
    // Payment details
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["wallet", "cash"],
      default: "wallet",
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
    // Auto-expire after 30 minutes if no provider found
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from creation
      index: { expireAfterSeconds: 0 }
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
consultationRequestSchema.index({ "address.coordinates": "2dsphere" }); // For geospatial queries

// Pre-save middleware to update timeline
consultationRequestSchema.pre("save", function(next) {
  if (this.isModified("status")) {
    const now = new Date();
    switch (this.status) {
      case "accepted":
        this.timeline.providerAccepted = now;
        break;
      case "en_route":
        this.timeline.providerEnRoute = now;
        break;
      case "arrived":
        this.timeline.providerArrived = now;
        break;
      case "in_progress":
        this.timeline.consultationStarted = now;
        break;
      case "completed":
        this.timeline.consultationCompleted = now;
        break;
    }
  }
  next();
});

const ConsultationRequest = mongoose.model("ConsultationRequest", consultationRequestSchema)

module.exports = ConsultationRequest;