const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
                  ref: 'user',
                  required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    walletID: {
    type: String,
    required: true,
  },
    time: {
      type: Date,
      required: true,
    },
    referrence: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      enum: ["deposit", "withdrawal", "earning", "transfer"],
      default: "deposit",
      required: true,
    },
    status: {
      type: String,
      enum: ["completed", "pending", "failed"],
      default: "pending",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Transaction = mongoose.model("Transaction", transactionSchema);
module.exports = Transaction;