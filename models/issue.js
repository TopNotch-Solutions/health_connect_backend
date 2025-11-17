const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    issueImage: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["Open", "Closed", "In Progress"],
      default: "Open",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Issue = mongoose.model("issue", issueSchema);
module.exports = Issue;