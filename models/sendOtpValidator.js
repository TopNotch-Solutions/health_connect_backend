const mongoose = require("mongoose");

const otpRequestLimitSchema = new mongoose.Schema(
  {
    cellphoneNumber: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    requestCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one record per user per day
otpRequestLimitSchema.index(
  { cellphoneNumber: 1, date: 1 },
  { unique: true }
);

const OtpRequestLimit = mongoose.model(
  "OtpRequestLimit",
  otpRequestLimitSchema
);

module.exports = OtpRequestLimit;
