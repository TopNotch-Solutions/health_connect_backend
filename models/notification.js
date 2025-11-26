const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    type: {
      type: String,
      enum: [
        // General notifications
        "welcome",
        "reminder",
        "alert",
        "promotion",

        // Issue related
        "issue_reported",
        "issue_updated",
        "issue_resolved",
        // Consultation related
        "consultation_requested",
        "consultation_accepted",
        "consultation_rejected",
        "consultation_en_route",
        "consultation_arrived",
        "consultation_started",
        "consultation_completed",
        "consultation_cancelled",
        
        // Location related
        "location_updated",
        "location_changed",
        "location_pinned",
        "provider_nearby",
        
        // Payment related
        "payment_required",
        "payment_completed",
        "payment_failed",
        "refund_processed",
        
        // Rating related
        "rating_received",
        "rating_requested",
        
        // System related
        "app_update",
        "maintenance_scheduled",
        "emergency_alert",
        
        // Provider specific
        "new_request_available",
        "request_expired",
        "schedule_reminder",
        
        // Patient specific
        "provider_assigned",
        "consultation_reminder",
        "follow_up_reminder",
        
        // Document related
        "qualification_expired",
        "qualification_expiring_soon"
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxLength: 100,
    },
    message: {
      type: String,
      required: true,
      maxLength: 500,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed"],
      default: "pending",
    },
    channels: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
    },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ type: 1, status: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });

notificationSchema.pre("save", function(next) {
  if (this.isModified("status")) {
    const now = new Date();
    switch (this.status) {
      case "sent":
        this.sentAt = now;
        break;
      case "delivered":
        this.deliveredAt = now;
        break;
      case "read":
        this.readAt = now;
        break;
    }
  }
  next();
});

notificationSchema.statics.createNotification = async function(notificationData) {
  const notification = new this(notificationData);
  await notification.save();
  return notification;
};

notificationSchema.methods.markAsRead = function() {
  this.status = "read";
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = function() {
  this.status = "delivered";
  this.deliveredAt = new Date();
  return this.save();
};

const Notification =
  mongoose.models.Notification ||
  mongoose.model("notification", notificationSchema);

module.exports = Notification;