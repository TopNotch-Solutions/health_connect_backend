const mongoose = require("mongoose");

/**
 * Provider practice banking details for medical aid claim statements.
 *
 * Example on claim PDF:
 *   ***PRACTICE BANKING DETAILS***
 *   DR ANNA HASHEELA
 *   FIRST NATIONAL BANK NAMIBIA
 *   BRANCH NAME : NAMIBIA
 *   BRANCH CODE : 280071
 *   ACCOUNT NUMBER : 62156218432
 *   ACCOUNT TYPE : PLATINUM LIFESTYLE
 *   REFERENCE: <claim-specific>
 */
const bankDetailsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
      index: true,
    },
    accountHolder: {
      type: String,
      required: true,
      trim: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    branchName: {
      type: String,
      required: true,
      trim: true,
    },
    branchCode: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    accountType: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const BankDetails = mongoose.model("BankDetails", bankDetailsSchema);
module.exports = BankDetails;
