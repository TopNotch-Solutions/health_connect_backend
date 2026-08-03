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
    time: {
      type: Date,
      required: true,
    },
    referrence: {
      type: String,
      required: false,
    },
    // The REFERENCE sent to PayGate. Unique so a single payment can never be
    // redeemed twice, and sparse so existing rows without one do not collide.
    // Doubles as the join key when reconciling against PayGate settlements.
    dpoReference: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    type: {
      type: String,
      enum: ["deposit", "withdrawal", "earning", "transfer", "purchase"],
      default: "purchase",
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