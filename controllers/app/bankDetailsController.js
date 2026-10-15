const BankDetails = require("../../models/bankDetails");
const {
  validateBankDetails,
  isBankDetailsComplete,
  maskAccountNumber,
} = require("../../utils/bankDetailsValidation");

function serialize(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    userId: String(obj.userId),
    accountHolder: obj.accountHolder || "",
    bankName: obj.bankName || "",
    branchName: obj.branchName || "",
    branchCode: obj.branchCode || "",
    // Never expose the full account number via the API (claim PDF reads DB).
    accountNumber: maskAccountNumber(obj.accountNumber),
    accountType: obj.accountType || "",
    isComplete: isBankDetailsComplete(obj),
    updatedAt: obj.updatedAt,
    createdAt: obj.createdAt,
  };
}

/** GET /api/app/bank-details */
exports.getMine = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: "ERROR",
        message: "Authentication required.",
      });
    }

    const doc = await BankDetails.findOne({ userId });
    return res.status(200).json({
      status: "SUCCESS",
      data: serialize(doc),
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

/** PUT /api/app/bank-details */
exports.upsertMine = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: "ERROR",
        message: "Authentication required.",
      });
    }

    const existing = await BankDetails.findOne({ userId });
    const validation = validateBankDetails(req.body || {}, {
      existingAccountNumber: existing?.accountNumber,
    });
    if (!validation.ok) {
      return res.status(400).json({
        status: "ERROR",
        message: validation.error,
      });
    }

    const doc = await BankDetails.findOneAndUpdate(
      { userId },
      { userId, ...validation.data },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      status: "SUCCESS",
      message: "Bank details saved.",
      data: serialize(doc),
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const first = Object.values(error.errors || {})[0];
      return res.status(400).json({
        status: "ERROR",
        message: first?.message || "Invalid bank details.",
      });
    }
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};
