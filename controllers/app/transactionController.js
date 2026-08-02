const Package = require("../../models/packages");
const Transaction = require("../../models/transaction");
const User = require("../../models/user");
const generateTransactionReference = require("../../utils/referrenceGenerator");
const { initiateDpoPayment, queryDpoTransaction } = require("../../utils/dpoPayment");
const mongoose = require("mongoose");

// Opens a payment with PayGate. The merchant credentials stay on this server —
// the app only receives the identifiers it needs to render the hosted page.
exports.initiatePackagePayment = async (req, res) => {
  const id = req.user.id;
  const { packageId } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }

  if (!packageId) {
    return res.status(400).json({ message: "Package ID is required" });
  }

  try {
    const user = await User.findOne({ _id: id });
    if (!user) {
      return res.status(404).json({ message: "It seems you don’t have an account yet. Please register to get started." });
    }

    const myPackage = await Package.findById(packageId);
    if (!myPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    if (!user.isDocumentVerified) {
      return res.status(403).json({ message: "Your documents must be verified by admin before purchasing a package." });
    }

    // Checked before taking any money, which is the only point where refusing
    // costs the user nothing.
    if (user.consultations > 0) {
      return res.status(409).json({ message: "You already have an active package. Please use all consultations before buying another package." });
    }

    if (!user.email) {
      return res.status(400).json({ message: "Please update your account email and try again." });
    }

    // Amount comes from the package, not the request body.
    const amountInCents = Math.round(Number(myPackage.amount) * 100);
    const reference = generateTransactionReference();

    const init = await initiateDpoPayment(reference, amountInCents, user.email);
    if (!init.success || !init.payRequestId || !init.checksum) {
      return res.status(502).json({ message: "Failed to initiate payment." });
    }

    return res.status(200).json({
      reference,
      payRequestId: init.payRequestId,
      checksum: init.checksum,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.purchasePackage = async (req, res) => {
  const id = req.user.id;
  const { packageId, payRequestId, reference } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }

  if (!packageId) {
    return res.status(400).json({ message: "Package ID is required" });
  }

  if (!payRequestId || !reference) {
    return res.status(400).json({ message: "Payment details are required" });
  }

  try {
    const user = await User.findOne({ _id: id });
    if (!user) {
      return res.status(404).json({ message: "It seems you don’t have an account yet. Please register to get started." });
    }
   const myPackage = await Package.findById(packageId)
    if (!myPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    // Note: "one active package at a time" is deliberately NOT enforced here.
    // By this point the user has already paid, so refusing would keep their
    // money without recording anything. It belongs on the initiate side —
    // today the app enforces it before starting a payment.

    // Fast path for a replayed payment. The unique index on dpoReference is
    // the real guard — see the duplicate key handling below.
    const alreadyRedeemed = await Transaction.findOne({ dpoReference: reference });
    if (alreadyRedeemed) {
      return res.status(409).json({ message: "This payment has already been applied." });
    }

    // Ask PayGate whether this was actually paid. The client's own check is
    // only for feedback — it carries no authority here.
    const payment = await queryDpoTransaction(payRequestId, reference);
    if (!payment.paid) {
      return res.status(402).json({ message: payment.reason || "Payment could not be verified." });
    }

    // The amount paid must match the package price, otherwise a payment for
    // a cheap package could be redeemed against an expensive one.
    const expectedAmountInCents = Math.round(myPackage.amount * 100);
    if (payment.amountInCents === null) {
      console.warn(`[DPO] No AMOUNT returned for reference ${reference}; skipping amount check.`);
    } else if (payment.amountInCents !== expectedAmountInCents) {
      console.warn(`[DPO] Amount mismatch for reference ${reference}: paid ${payment.amountInCents}, expected ${expectedAmountInCents}`);
      return res.status(402).json({ message: "Payment amount does not match the selected package." });
    }

    const referrence = generateTransactionReference();
    await Transaction.create({
      userId: id,
      amount: myPackage.amount,
      time: new Date(),
      referrence,
      dpoReference: reference,
      type: "purchase",
      status: "completed",
    });

    user.consultations = user.consultations + myPackage.consultations;
    await user.save();

    const userUpdated = await User.findOne({ _id: id }).select('-password -verifiedCellphoneNumber');
    return res.status(200).json({
      message: "Package successfully purchased.",
      user: userUpdated
    });
  } catch (error) {
    // Two concurrent requests for the same reference: the unique index rejects
    // the second one, so it is a replay rather than a server fault.
    if (error?.code === 11000) {
      return res.status(409).json({ message: "This payment has already been applied." });
    }
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Money-wallet endpoints are disabled.
//
// These three previously wrote Transaction rows with status "completed" for
// deposits, transfers and withdrawals that never happened: no payment was
// taken, no funds moved, and nothing was credited or debited. There is no
// balance to check against — the user model has no balance field, and the
// only real unit of account is the consultations counter.
//
// Leaving them live means the ledger accumulates fabricated financial records
// that are indistinguishable from real ones. Re-enable only once a real
// balance model and a payout rail exist behind them. Git history has the
// previous implementations.
// ---------------------------------------------------------------------------
const walletNotImplemented = (res) =>
  res.status(501).json({
    message: "Wallet transfers and withdrawals are not available yet.",
  });

exports.fundSomeonesWallet = async (req, res) => walletNotImplemented(res);

exports.wallet2Wallet = async (req, res) => walletNotImplemented(res);

exports.withdrawal = async (req, res) => walletNotImplemented(res);
exports.all = async (req, res) => {
  const id = req.user.id;
  const { page = 1, limit = 10 } = req.query;
  
  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }

  try {
    // Convert page and limit to numbers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    
    // Validate pagination parameters
    if (pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({ 
        message: "Page and limit must be positive numbers" 
      });
    }

    // Calculate skip value for pagination
    const skip = (pageNumber - 1) * limitNumber;

    // Get total count of transactions for this user
    const totalTransactions = await Transaction.countDocuments({ userId: id });

    // Fetch paginated transactions, sorted by time (most recent first)
    const userTransactions = await Transaction.find({ userId: id })
      .sort({ time: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Calculate total pages
    const totalPages = Math.ceil(totalTransactions / limitNumber);

    return res.status(200).json({
      message: "User's transactions retrieved",
      data: userTransactions,
      pagination: {
        currentPage: pageNumber,
        totalPages: totalPages,
        totalTransactions: totalTransactions,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      }
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('userId', 'fullname email').sort({ time: -1 });
    res.status(200).json({ status: true, transactions });
  } catch (error) {
    console.error("Error fetching all transactions:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly." });
  }
};
exports.allEarnings = async (req, res) => {
  const id = req.user.id;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }
  try {
    const now = new Date();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0
    );

    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const result = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(id),
          type: "earning",
          status: "completed",
          time: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    res.status(200).json({
      status: true,
      currentMonthEarnings: result[0]?.totalAmount || 0,
    });
  } catch (error) {
    console.error("Error fetching total earnings:", error);
    res.status(500).json({
      message: "We're having trouble processing your request. Please try again shortly.",
    });
  }
};
