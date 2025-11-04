const mongoose = require('mongoose');

const LoginAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
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
    collection: 'login_attempts',
  }
);

const LoginAttempt = mongoose.model('LoginAttempt', LoginAttemptSchema);
module.exports = LoginAttempt;