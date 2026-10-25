const mongoose = require("mongoose");

const icd10Schema = new mongoose.Schema(
  {
    ICD_10_code: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    MAF: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // Optional second ICD-10 code + MAF + price for the same alignment/claim
    secondaryICD_10_code: {
      type: String,
      trim: true,
      default: null,
    },
    secondaryMAF: {
      type: String,
      trim: true,
      default: null,
    },
    secondaryPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    specializations: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "specialization",
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one specialization is required",
      },
    },
    alignments: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "AilmentCategory",
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one alignment (ailment) is required",
      },
    },
  },
  {
    timestamps: true,
  },
);

const Icd10 = mongoose.model("Icd10", icd10Schema);

module.exports = Icd10;
