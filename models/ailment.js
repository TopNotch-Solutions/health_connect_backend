const mongoose = require("mongoose");
const { NUMBER } = require("sequelize");

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
    initialCost: {
      type: Number,
      required: true,
    },
    cost: {
      type: Number,
      required: true,
    },
    commission: {
      type: Number,
      required: true,
      default: 0.00,
    },
     priority:{
    type: Number,
    enum: [1, 2, 3],
    default: 2,
    required: true,
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
