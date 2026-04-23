const mongoose = require("mongoose");

const ailmentCategorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    teleconsultationCost: {
      type: Number,
      required: false,
      default: null,
    },
    physicalconsultationCost: {
      type: Number,
      required: false,
      default: null,
    },
    specialization: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "specialization",
      required: true,
    },
    provider: {
      type: String,
      enum: ["Doctor", "Nurse", "Physiotherapist", "Social Worker"],
      required: false,
    },
    supportsTeleconsultation: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const AilmentCategory = mongoose.model("AilmentCategory", ailmentCategorySchema);

module.exports = AilmentCategory;
