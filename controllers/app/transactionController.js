const Package = require("../../models/packages");
const Transaction = require("../../models/transaction");
const User = require("../../models/user");
const generateTransactionReference = require("../../utils/referrenceGenerator");
const mongoose = require("mongoose");

exports.purchasePackage = async (req, res) => {
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
   const myPackage = await Package.findById(packageId)
    const referrence = generateTransactionReference();
    await Transaction.create({
      userId: id,
      amount: myPackage.amount,
      walletID: user.walletID,
      time: new Date(),
      referrence,
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
    console.log(error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.fundSomeonesWallet = async (req, res) => {
  const id = req.user.id;
  const { amount, cardNumber, expiryDate, cvv, walletID, cardHolder } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }
  if (!walletID) {
    return res.status(400).json({ message: "Wallet id is required" });
  }
  if (!amount) {
    return res.status(400).json({ message: "Amount is required" });
  }
  if (!cardNumber) {
    return res.status(400).json({ message: "Card number is required" });
  }
  if (!expiryDate) {
    return res.status(400).json({ message: "Card expiry date is required" });
  }
  if (!cvv) {
    return res.status(400).json({ message: "CVV is required" });
  }
  if (!cardHolder) {
    return res.status(400).json({ message: "Cardholder is required" });
  }

  try {
    const user = await User.findOne({ _id: id });
    if (!user) {
      return res.status(404).json({ message: "It seems you don’t have an account yet. Please register to get started." });
    }

    const doesWalletExist = await User.findOne({
        walletID
    });
    if (!doesWalletExist) {
      return res.status(404).json({ message: "Wallet ID not found." });
    }

    const userFunded = await User.findOne({ walletID });
    if (!userFunded) {
      return res.status(404).json({ message: "User being funded not found." });
    }

    const referrence = generateTransactionReference();
    await Transaction.create({
      userId: id,
      amount: amount,
      walletID,
      time: new Date(),
      referrence,
      type: "deposit",
      status: "completed",
    });
    
    userFunded.PreviousBalance = userFunded.balance;
    userFunded.balance = userFunded.balance + parseFloat(amount);
    await userFunded.save();

    const data = await Transaction.find({userId: id});
    return res.status(201).json({
      message: "Transaction created successfully.",
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error"+ error });
  }
};

exports.wallet2Wallet = async (req, res) => {
  const id = req.user.id;
  const { amount, walletID } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }
  if (!walletID) {
    return res.status(400).json({ message: "Wallet id is required" });
  }
  if (!amount) {
    return res.status(400).json({ message: "Amount is required" });
  }

  try {
    const user = await User.findOne({ _id: id });
    if (!user) {
      return res.status(404).json({ message: "We couldn’t find an account with the provided details." });
    }
    
    const userFunded = await User.findOne({ walletID });
    if (!userFunded) {
      return res.status(404).json({ message: "User being funded not found." });
    }

    if (user.balance <= 0) {
      return res.status(400).json({ message: "There are no funds to transfer." });
    }

    if (user.balance < amount) {
      return res.status(400).json({
        message:
          "Current balance can't withstand a withdrawal amount exceeding balance.",
      });
    }

    const referrence = generateTransactionReference();
    await Transaction.create({
      userId: id,
      amount: amount,
      walletID,
      time: new Date(),
      referrence,
      type: "transfer",
      status: "completed",
    });

    user.PreviousBalance = user.balance;
    user.balance = user.balance - parseFloat(amount);
    await user.save();

    userFunded.PreviousBalance = userFunded.balance;
    userFunded.balance = userFunded.balance + parseFloat(amount);
    await userFunded.save();

    const userUpdated = await User.findOne({ _id: id });
    return res.status(201).json({
      message: "Transaction created successfully.",
       user: userUpdated, 
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error"+ error });
  }
};
exports.withdrawal = async (req, res) => {
  const id = req.user.id;
  const { amount } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }
  if (!amount) {
    return res.status(400).json({ message: "Amount is required" });
  }

  try {
    const user = await User.findOne({ _id: id });
    if (!user) {
      return res.status(404).json({ message: "We couldn’t find an account with the provided details." });
    }

    if (user.balance <= 0) {
      return res.status(400).json({ message: "There are no funds to withdraw." });
    }

    if (user.balance < amount) {
      return res.status(400).json({
        message:
          "Current balance can't withstand a withdrawal amount exceeding balance.",
      });
    }

    const referrence = generateTransactionReference();
    await Transaction.create({
      userId: id,
      amount: amount,
      walletID: user.walletID,
      time: new Date(),
      referrence,
      type: "withdrawal",
      status: "completed",
    });

    user.PreviousBalance = user.balance;
    user.balance = user.balance - parseFloat(amount);
    await user.save();

    const userUpdated = await User.findOne({ _id: id });
    return res.status(201).json({
      message: "Transaction created successfully.",
       user: userUpdated, 
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error"+ error });
  }
};
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
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('userId', 'fullname email walletID').sort({ time: -1 });
    res.status(200).json({ status: true, transactions });
  } catch (error) {
    console.error("Error fetching all transactions:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
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
