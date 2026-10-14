const mongoose = require("mongoose");

const medicalAidSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    image: {
      type: String,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const MedicalAid = mongoose.model("MedicalAid", medicalAidSchema);

module.exports = MedicalAid;
