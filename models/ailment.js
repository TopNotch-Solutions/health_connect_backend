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
    cost: {
      type: String,
      required: true,
    },
    specialization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "specialization",
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

const AilmentCategory = mongoose.model("AilmentCategory", ailmentCategorySchema);

module.exports = AilmentCategory;