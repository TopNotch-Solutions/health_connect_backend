const User = require("../../models/user");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");
const walletIDGenerator = require("../../utils/walletGenerator");
const { validatePassword } = require("../../utils/validatePassword");
const OTP = require("../../models/otp");

exports.registerPatient = async (req, res) => {
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

    let profileImagePath = req.file ? req.file.filename : null;
    if (!fullname) {
      return res
        .status(400)
        .json({ message: "Full name is required." });
    }
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
     if (!profileImagePath) {
      return res
        .status(400)
        .json({ message: "Profile image is required." });
    }

    if (!isValidCellphoneNumber(cellphoneNumber)) {
      return res.status(400).json({ message: "Oops! That doesn’t look like a valid cellphone number. Please check and try again." });
    }
  try {
    
    const existingUser = await User.findOne({
      $or: [{ cellphoneNumber: cellphoneNumber }, { email: email }],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "You’re already registered with this phone number or email. Try logging in instead.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
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

exports.registerHealthProvider = async (req, res) => {
  let {
      fullname,
      cellphoneNumber,
      email,
      password,
      role,
      hpcnaNumber,
      address,
      gender,
      hpcnaExpiryDate,
      specializations,
      yearsOfExperience,
      operationalZone,
      governingCouncil,
      bio
    } = req.body;
    const files = req.files;

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
     if (!profileImagePath) {
      return res
        .status(400)
        .json({ message: "Profile image is required." });
    }
     if (!idDocumentFront) {
      return res
        .status(400)
        .json({ message: "ID front is required." });
    }
     if (!idDocumentBack) {
      return res
        .status(400)
        .json({ message: "ID back is required." });
    }

     if (!primaryQualification) {
      return res
        .status(400)
        .json({ message: "Primary qualification is required." });
    }

     if (!annualQualification) {
      return res
        .status(400)
        .json({ message: "Annuel qualification is required." });
    }
    if (!gender) {
      return res
        .status(400)
        .json({ message: "Gender is required." });
    }

  try {
    
    const existingUser = await User.findOne({
      $or: [{ cellphoneNumber: cellphoneNumber }, { email: email }],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "You’re already registered with this phone number or email. Try logging in instead.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    

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
      gender,
      bio,
      hpcnaNumber,
      role: newRole ,
      hpcnaExpiryDate,
      specializations,
      yearsOfExperience,
      operationalZone,
      annualQualification,
      primaryQualification,
      profileImage: profileImagePath,
      idDocumentFront,
      idDocumentBack,
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

exports.verifyOtpReset = async (req, res) => {
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
    
    if (!accountAlreadyExists) {
      await OTP.deleteMany({ cellphoneNumber });
      return res.status(404).json({
        activeUser: false,
        message: "It looks like you don’t have an account yet. Please sign up to continue.",
      });
    }

    await OTP.deleteMany({ cellphoneNumber });
    return res.status(200).json({
      activeUser: false,
      message: "OTP verified successfully",
      userId: accountAlreadyExists ? accountAlreadyExists._id : null
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
exports.resetPassword = async (req, res) => {
  let {
      password,
      confirmPassword,
    } = req.body;

    let { userId } = req.params;

     if (!userId) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }
     if (!password) {
      return res
        .status(400)
        .json({ message: "password is required." });
    }
     if (!confirmPassword) {
      return res
        .status(400)
        .json({ message: "Confirm password is required." });
    }
    const result = validatePassword(password);
    
        if (!result.valid) {
      
            return res
                    .status(400)
                    .json({ message: result?.message });
            }
    if (password.toLowerCase() !== confirmPassword.toLowerCase()) {
      return res
        .status(400)
        .json({ message: "Password and confirm password do not match." });
    }
      
  try{
    const existingUser = await User.findById(userId);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don’t have an account yet. Please register to get started.",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    existingUser.password = hashedPassword;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Great! Your password was reset successfully.",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}