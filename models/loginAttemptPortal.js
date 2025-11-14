const mongoose = require('mongoose');

const LoginAttemptPortalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user_portal',
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttempt: {
      type: Date,
      default: null,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,

  }
);

const LoginAttemptPortalUser = mongoose.model('login_portal_user', LoginAttemptPortalSchema);
module.exports = LoginAttemptPortalUser;