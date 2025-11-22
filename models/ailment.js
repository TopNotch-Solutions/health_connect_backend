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

    specialization: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "specialization",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const AilmentCategory = mongoose.model("AilmentCategory", ailmentCategorySchema);

module.exports = AilmentCategory;