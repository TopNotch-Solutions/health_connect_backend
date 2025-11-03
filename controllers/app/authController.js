const User = require("../../models/user");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");
const walletIDGenerator = require("../../utils/walletGenerator");
const { validatePassword } = require("../../utils/validatePassword");

exports.register = async (req, res) => {
  try {
    const {
      fullname,
      cellphoneNumber,
      email,
      password,
      dateOfBirth,
      gender,
      nationalId,
      address,
      town,
      region,
    } = req.body;

    if (!cellphoneNumber) {
      return res
        .status(400)
        .json({ message: "Cellphone number is required." });
    }
    if (!password) {
      return res
        .status(400)
        .json({ message: "Password is required." });
    }

    const result = validatePassword(password);

    if (!result.valid) {
  
        return res
                .status(400)
                .json({ message: result?.message });
        }
    if (!email) {
      return res
        .status(400)
        .json({ message: "Email is required." });
    }
    if (!dateOfBirth) {
      return res
        .status(400)
        .json({ message: "Date of birth is required." });
    }
    if (!address) {
      return res
        .status(400)
        .json({ message: "Address is required." });
    }
    if (!town) {
      return res
        .status(400)
        .json({ message: "Town is required." });
    }
    
    if (!region) {
      return res
        .status(400)
        .json({ message: "Region is required." });
    }

    if (!isValidCellphoneNumber(cellphoneNumber)) {
      return res.status(400).json({ message: "Oops! That doesn’t look like a valid cellphone number. Please check and try again." });
    }
    const existingUser = await User.findOne({
      $or: [{ cellphoneNumber: cellphoneNumber }, { email: email }],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "You’re already registered with this phone number or email. Try logging in instead.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let profileImagePath = req.file ? req.file.filename : null;
    console.log(req.file)

    let walletId;
    let isWalletIdUnique = false;
    let attempts = 0;
    const maxAttempts = 20;
    while (!isWalletIdUnique && attempts < maxAttempts) {
      walletId = walletIDGenerator();
      if (!walletId) {
        return res
          .status(500)
          .json({ message: "We’re having trouble processing your request. Please try again shortly." });
      }

      const checkWalletID = await User.findOne({ walletID: walletId });
      if (!checkWalletID) {
        isWalletIdUnique = true;
      }
      attempts++;
    }
    if (!isWalletIdUnique) {
      return res
        .status(500)
        .json({
          message:
            "We’re having trouble processing your request. Please try again shortly.",
        });
    }
    await User.create({
      fullname,
      cellphoneNumber,
      email,
      password: hashedPassword,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      walletID: walletId,
      nationalID: nationalId,
      address,
      role: "patient",
      town,
      region,
      profileImage: profileImagePath,
      verifiedCellphoneNumber: cellphoneNumber,
      isAccountVerified: true,
    });

    res.status(201).json({
      status: true,
      message: "Patient registration completed successfully.",
    });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};