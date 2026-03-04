const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ["doctor", "nurse", "physiotherapist", "social worker"],
    },
    amount: {
      type: Number,
      required: true,
    },
    consultations: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const Package = mongoose.model("Package", packageSchema);

module.exports = Package;
