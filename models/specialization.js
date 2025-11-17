const mongoose = require("mongoose");

const specializationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    role: {
      type: [String], 
      enum: ["doctor", "nurse", "physiotherapist", "social worker"],
      default: ["doctor"], 
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Specialization = mongoose.model("specialization", specializationSchema);

module.exports = Specialization;