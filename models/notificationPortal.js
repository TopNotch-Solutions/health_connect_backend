const mongoose = require("mongoose");

const notificationPortalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
            ref: 'user_portal',
            required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
        default: false,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const NotificationPortal = mongoose.model("notification_user", notificationPortalSchema);
module.exports = NotificationPortal;