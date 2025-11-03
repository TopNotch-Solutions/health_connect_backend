const OTP = require("../../models/otp");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const User = require("../../models/user");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");

exports.sendOtp = async (req, res) => {
  const { cellphoneNumber } = req.body;

  if (!cellphoneNumber) {
    return res.status(400).json({ message: "Cellphone number is required" });
  }

  if (!isValidCellphoneNumber(cellphoneNumber)) {
  return res.status(400).json({ message: "Oops! That doesn’t look like a valid cellphone number. Please check and try again." });
}

  try {
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