const User = require("../../models/user");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");
const walletIDGenerator = require("../../utils/walletGenerator");
const { validatePassword } = require("../../utils/validatePassword");
const OTP = require("../../models/otp");
const LoginAttempt = require("../../models/loginAttempts");

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

    let userId  = req.params.id;

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

exports.login = async (req, res) => {
  const {email, password} = req.body;

  if (!email) {
      return res
        .status(400)
        .json({ message: "Username is required." });
    }
    if (!password) {
      return res
        .status(400)
        .json({ message: "Password is required." });
    }
  try{
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "We couldn’t sign you in. Please check your username and password, then try again.",
      });
    }

    let loginAttempt = await LoginAttempt.findOne({ userId: user._id });
    if (!loginAttempt) {
      loginAttempt = await LoginAttempt.create({ userId: user._id, attempts: 0 });
      console.log(
        `[LOGIN ATTEMPT CREATED] For userId: ${user._id}, attempts: ${loginAttempt.attempts}`
      );
    }else {
      console.log(
        `[LOGIN ATTEMPT FOUND] For userId: ${user._id}, attempts: ${loginAttempt.attempts}, lastAttempt: ${loginAttempt.lastAttempt}`
      );
    }

    const lockoutDurations = [3, 5, 10, 30];
    if (loginAttempt.attempts >= 3 && loginAttempt.lastAttempt) {
      const now = new Date();
      const lastAttemptTime = new Date(loginAttempt.lastAttempt);
      const diffMinutes =
        (now.getTime() - lastAttemptTime.getTime()) / (1000 * 60);
        const lockoutOccurrence = Math.floor((loginAttempt.attempts - 1) / 3);
      const currentLockoutDuration =
        lockoutDurations[
          Math.min(lockoutOccurrence, lockoutDurations.length - 1)
        ];
         if (diffMinutes < currentLockoutDuration) {
        const waitTime = Math.ceil(currentLockoutDuration - diffMinutes);
        console.log(
          `[LOCKOUT] User ${user.email} is locked. Attempts: ${loginAttempt.attempts}. Needs to wait ${waitTime} more min(s). Current lockout duration: ${currentLockoutDuration} min.`
        );
        return res.status(403).json({
          status: false,
          message: `You’ve made too many unsuccessful attempts. Please wait ${waitTime} minute(s) before trying again.`,
        });
      }
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const failedAttemptsCount = loginAttempt.attempts + 1;
      await LoginAttempt.updateOne(
        { userId: user._id },
        { $set: { attempts: failedAttemptsCount, lastAttempt: new Date() } });
         console.log(
        `[LOGIN FAIL] User: ${user.email}, Attempts updated to: ${failedAttemptsCount}`
      );

       let message =
        "The credentials you entered are incorrect. Please verify your username or password and try again.";
         if (failedAttemptsCount >= 3 && failedAttemptsCount % 3 === 0) {
        const lockoutOccurrence = Math.floor((failedAttemptsCount - 1) / 3);
        const nextLockoutDuration =
          lockoutDurations[
            Math.min(lockoutOccurrence, lockoutDurations.length - 1)
          ];
        message = `Oops! Too many failed login attempts. Please wait ${nextLockoutDuration} minute(s) before trying again`;
      }
      return res.status(401).json({
        status: false,
        message: message,
      });
    }
    console.log(
      `[LOGIN SUCCESS] User: ${user.email}. Current attempts before reset: ${loginAttempt.attempts}`
    );
    if (loginAttempt.attempts > 0 || loginAttempt.lastAttempt !== null) {
      const numberOfAffectedRows = await LoginAttempt.updateOne(
        { userId: user._id },
        { $set: { attempts: 0, lastAttempt: null } }
      );
       if (numberOfAffectedRows > 0) {
        console.log(
          `[LOGIN SUCCESS] Login attempts reset successfully for userId: ${user._id}. Rows affected: ${numberOfAffectedRows}`
        );
      } else {
        console.warn(
          `[LOGIN SUCCESS] FAILED TO RESET login attempts for userId: ${user._id}. No rows were updated. This is unexpected. Current attempts: ${loginAttempt.attempts}`
        );
      }
    }else{
       console.log(
        `[LOGIN SUCCESS] No reset needed for userId: ${user._id} as attempts were already 0 and lastAttempt was null.`
      );
    }

    const updatedLoginAttempt = await LoginAttempt.findOne({ userId: user._id });
    if (updatedLoginAttempt) {
      console.log(
        `[LOGIN SUCCESS] LoginAttempt state AFTER successful login for userId: ${user.id}, attempts: ${updatedLoginAttempt.attempts}, lastAttempt: ${updatedLoginAttempt.lastAttempt}`
      );
      loginAttempt = updatedLoginAttempt;
    } else {
      console.warn(
        `[LOGIN SUCCESS] LoginAttempt record NOT FOUND for userId: ${user.id} after successful login. Creating one.`
      );
      loginAttempt = await LoginAttempt.create({ userId: user._id, attempts: 0 });
    }
     return res.status(200).json({
      status: true,
      message: "You have logged in successfully.",
      user:{
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        cellphoneNumber: user.cellphoneNumber,
        walletID: user.walletID,
        userId: user._id,
        dateOfBirth: user.dateOfBirth,
        balance: user.balance,
        profileImage: user.profileImage,
        address: user.address,
        region: user.region,
        town: user.town,
        isAccountVerified: user.isAccountVerified,
      }
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.removeProfileImage = async (req, res) => {
  const { id } = req.params;

if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don’t have an account yet. Please register to get started.",
      });
    }
    if (existingUser.profileImage) {
      const oldImagePath = path.join("public", "images", existingUser.profileImage);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.profileImage = null;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your profile image has been removed successfully.",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateProfileImage = async (req, res) => {
  const { id } = req.params;
  const files = req.files;

  let profileImagePath = files.profileImage
      ? files.profileImage[0].filename
      : null;
      

if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }

    if (!profileImagePath) {
      return res
        .status(400)
        .json({ message: "Profile image is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don’t have an account yet. Please register to get started.",
      });
    }
    if (existingUser.profileImage) {
      const oldImagePath = path.join("public", "images", existingUser.profileImage);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.profileImage = profileImagePath;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your profile image has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
}