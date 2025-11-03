const { spec } = require("node:test/reporters");
const User = require("../../models/user");
const { validatePassword } = require("../../utils/validatePassword");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const walletIDGenerator = require("../../utils/walletGenerator");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");

exports.register = async (req, res) => {
  try {
    let {
      fullname,
      cellphoneNumber,
      email,
      password,
      role,
      hpcnaNumber,
      address,
      hpcnaExpiryDate,
      specializations,
      yearsOfExperience,
      operationalZone,
    } = req.body;
    const files = req.files;

    if (!fullname) {
      return res
        .status(400)
        .json({ message: "Fullname is required." });
    }
    if (!cellphoneNumber) {
      return res
        .status(400)
        .json({ message: "Cellphone number is required." });
    }
    if (!isValidCellphoneNumber(cellphoneNumber)) {
          return res.status(400).json({ message: "Oops! That doesn’t look like a valid cellphone number. Please check and try again." });
        }
    if (!email) {
      return res
        .status(400)
        .json({ message: "Email is required." });
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


    if (!role) {
      return res
        .status(400)
        .json({ message: "Role is required." });
    }
     if (!specializations || specializations.length === 0) {
      return res
        .status(400)
        .json({ message: "Specialization is required." });
    }
    if (!governingCouncil) {
      return res
        .status(400)
        .json({ message: "Governing council is required." });
    }
    if (!hpcnaNumber) {
      return res
        .status(400)
        .json({ message: "HPCNA number is required." });
    }
    if (!bio) {
      return res
        .status(400)
        .json({ message: "Professional bio is required." });
    }
    if (!hpcnaExpiryDate) {
      return res
        .status(400)
        .json({ message: "HPCNA expiry date is required." });
    }

    if (!yearsOfExperience) {
      return res
        .status(400)
        .json({ message: "Years of experience is required." });
    }
    if (!operationalZone) {
      return res
        .status(400)
        .json({ message: "Operational zone is required." });
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
    let profileImagePath = files.profileImage
      ? files.profileImage[0].filename
      : null;

      let idDocumentFront = files.idDocumentFront
      ? files.idDocumentFront[0].filename
      : null;

      let idDocumentBack = files.idDocumentBack
      ? files.idDocumentBack[0].filename
      : null;

      let primaryQualification = files.primaryQualification
      ? files.primaryQualification[0].filename
      : null;

      let annualQualification = files.annualQualification
      ? files.annualQualification[0].filename
      : null;

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
    const newRole = role.toLowerCase();
    
    await User.create({
      fullname,
      cellphoneNumber,
      email,
      password: hashedPassword,
      walletID: walletId,
      address,
      hpcnaNumber,
      role: newRole ,
      hpcnaExpiryDate,
      specializations,
      yearsOfExperience,
      operationalZone,
      hpcnaCertificate: hpcnaCertificatePath,
      medicalDegree: medicalDegreePath,
      profileImage: profileImagePath,
      professionalLicense: professionalLicensePath,
      verifiedCellphoneNumber: cellphoneNumber,
      isAccountVerified: true,
      isDocumentsSubmitted: true,
    });

    res.status(201).json({
      status: true,
      message: "Health provider registration completed successfully.",
    });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};