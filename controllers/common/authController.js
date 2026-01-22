const OTP = require("../../models/otp");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const User = require("../../models/user");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");
const OtpRequestLimit = require("../../models/sendOtpValidator");
const callExternalApi = require("../../utils/connectSMS");
const MAX_DAILY_OTP_REQUESTS = 6;

exports.sendOtp = async (req, res) => {
  const { cellphoneNumber } = req.body;

  if (!cellphoneNumber) {
    return res.status(400).json({ message: "Cellphone number is required" });
  }

  if (!isValidCellphoneNumber(cellphoneNumber)) {
  return res.status(400).json({ message: "Oops! That doesn’t look like a valid cellphone number. Please check and try again." });
}

  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

let otpLimit = await OtpRequestLimit.findOne({
  cellphoneNumber,
  date: today,
});

if (!otpLimit) {
  otpLimit = await OtpRequestLimit.create({
    cellphoneNumber,
    date: today,
    requestCount: 1,
  });
} else {
  if (otpLimit.requestCount >= MAX_DAILY_OTP_REQUESTS) {
    return res.status(429).json({
      message:
        "You have reached the maximum number of OTP requests for today. Please try again tomorrow.",
    });
  }

  otpLimit.requestCount += 1;
  await otpLimit.save();
}
    await OTP.deleteMany({ cellphoneNumber });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = new Date();
    const expireAt = new Date(createdAt.getTime() + 5 * 60000);
    const salt = await bcrypt.genSalt();
    const hashedOTP = await bcrypt.hash(otp, salt);
    await OTP.create({
      cellphoneNumber: cellphoneNumber,
      otp: hashedOTP,
      createdAt: createdAt,
      expireAt: expireAt,
    });
    callExternalApi(
  `+${cellphoneNumber}`,
  `Your Health Connect verification code is ${otp}. It will expire in 5 minutes. Do not share this code with anyone. Health Connect will never ask for your OTP.`
);

    console.log(`OTP for ${cellphoneNumber} is ${otp}`);
    res
      .status(200)
      .json({ status: true, message: "OTP sent successfully", otp });
  } catch (error) {
    console.error("Error registering passager:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};

exports.verifyOtp = async (req, res) => {
  const { cellphoneNumber, otp } = req.body;

  if (!cellphoneNumber) {
    return res.status(400).json({ message: "Cellphone number is required." });
  }
  if (!otp) {
    return res.status(400).json({ message: "OTP is required" });
  }
  if (!isValidCellphoneNumber(cellphoneNumber)) {
  return res.status(400).json({ message: "Oops! That doesn’t look like a valid cellphone number. Please check and try again." });
}

  try {
    const otpRecord = await OTP.findOne({
      cellphoneNumber,
    });
    console.log("My opt", otpRecord);

    if (!otpRecord) {
      return res.status(400).json({
        message: "No verification code found for this phone number. Please resend OTP.",
      });
    }
    const isOtpValid = await bcrypt.compare(otp, otpRecord.otp);
    if (!isOtpValid) {
      return res.status(400).json({
        message:
          "The OTP you entered is incorrect. Please check the code & try again.",
      });
    }

    const currentTime = new Date();
    if (currentTime > new Date(otpRecord.expireAt)) {
      return res.status(400).json({ message: "This OTP is no longer valid. Generate a new OTP to continue." });
    }

    const accountAlreadyExists = await User.findOne({
      cellphoneNumber, isAccountVerified: true
    });
    console.log("My acccount number: ", accountAlreadyExists)
    if (accountAlreadyExists) {
      await OTP.deleteMany({ cellphoneNumber });
      accountAlreadyExists.accountDeactivation = false;
      await accountAlreadyExists.save();
      return res.status(200).json({
        activeUser: true,
        message: "Looks like you’re already registered and verified. Please log in to continue.",
        user: accountAlreadyExists,
      });
    }
    await OTP.deleteMany({ cellphoneNumber });
    return res.status(200).json({
      activeUser: false,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};