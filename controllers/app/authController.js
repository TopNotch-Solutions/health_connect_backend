const User = require("../../models/user");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");
const walletIDGenerator = require("../../utils/walletGenerator");
const { validatePassword } = require("../../utils/validatePassword");
const OTP = require("../../models/otp");
const LoginAttempt = require("../../models/loginAttempts");
const Notification = require("../../models/notification");
const NotificationPortal = require("../../models/notificationPortal");

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
    if (!nationalId) {
      return res
        .status(400)
        .json({ message: "National ID number is required." });
    }
    if (!isValidCellphoneNumber(cellphoneNumber)) {
      return res.status(400).json({ message: "Oops! That doesn�t look like a valid cellphone number. Please check and try again." });
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
  try {
    
    const existingUser = await User.findOne({
      $or: [{ cellphoneNumber: cellphoneNumber }, { email: email },{ nationalId}],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "You�re already registered with this phone number, email or national ID. Try logging in instead.",
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
          .json({ message: "We're having trouble processing your request. Please try again shortly." });
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
        .json({ message: "We're having trouble processing your request. Please try again shortly." });
    }

    const newUser = await User.create({
      fullname,
      cellphoneNumber,
      email,
      password: hashedPassword,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      walletID: walletId,
      nationalId,
      address,
      role: "patient",
      town,
      region,
      profileImage: profileImagePath,
      idDocumentFront,
      idDocumentBack,
      verifiedCellphoneNumber: cellphoneNumber,
      isAccountVerified: true,
    });

    await Notification.createNotification({
      userId: newUser._id,
      type: "welcome",
      title: "Welcome to Our Health Platform!",
      status: "sent",
      message: `Hi ${newUser.fullname}, welcome aboard! We're excited to have you as a part of our health community. Start exploring our services today!`,
    });

    const allPortalUsers = await NotificationPortal.find();
    if (allPortalUsers && allPortalUsers.length > 0) {
      for (const portalUserNotification of allPortalUsers) {
        await NotificationPortal.create({
          userId: portalUserNotification.userId,
          title: "New Patient Registered",
          message: `A new patient, ${newUser.fullname}, has just registered on the platform.`,
        });
      }
    }



    res.status(201).json({

      status: true,

      message: "Patient registration completed successfully.",

    });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
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
      nationalId,
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
      let prescribingCerificate = files.prescribingCerificate
      ? files.prescribingCerificate[0].filename
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
          return res.status(400).json({ message: "Oops! That doesn�t look like a valid cellphone number. Please check and try again." });
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
    if (!nationalId) {
      return res
        .status(400)
        .json({ message: "National ID number is required." });
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
    if (role.toLowerCase() === "nurse" && !prescribingCerificate) {
      return res
        .status(400)
        .json({ message: "Prescribing certificate is required for nurses." });
    }
    if (!gender) {
      return res
        .status(400)
        .json({ message: "Gender is required." });
    }

  try {
    
    const existingUser = await User.findOne({
      $or: [{ cellphoneNumber: cellphoneNumber }, { email: email },{nationalId}],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "You�re already registered with this phone number, email or national ID. Try logging in instead.",
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
          .json({ message: "We�re having trouble processing your request. Please try again shortly." });
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
            "We�re having trouble processing your request. Please try again shortly.",
        });
    }
    const newRole = role.toLowerCase();
    
   const newUser = await User.create({
      fullname,
      cellphoneNumber,
      email,
      password: hashedPassword,
      walletID: walletId,
      address,
      gender,
      bio,
      nationalId,
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
      prescribingCerificate
    });
    await Notification.createNotification({
      userId: newUser._id,
      type: "welcome",
      title: "Welcome to Our Health Platform!",
      status: "sent",
      message: `Hi ${newUser.fullname}, welcome aboard! We're excited to have you as a part of our health community. Start exploring our services today!`,
      });
      const allPortalUsers = await NotificationPortal.find();
      if(allPortalUsers && allPortalUsers.length > 0) {
        for(const portalUserNotification of allPortalUsers) {
          await NotificationPortal.create({
            userId: portalUserNotification.userId,
            title: "New health provider has registered",
            message: `A new health provider, ${newUser.fullname}, has just registered on the platform. Kindly review their details.`,
          });
        }
      }
    res.status(201).json({
      status: true,
      message: "Health provider registration completed successfully.",
    });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
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
  return res.status(400).json({ message: "Oops! That doesn�t look like a valid cellphone number. Please check and try again." });
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
        message: "It looks like you don�t have an account yet. Please sign up to continue.",
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
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
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
        message: "It seems you don�t have an account yet. Please register to get started.",
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
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
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
     const user = await User.findOne({
      $or: [
        { email: email },
        { cellphoneNumber: email }
      ],
    });

    if (!user) {
      return res.status(404).json({
        message: "We couldn't sign you in. Please check your username and password, then try again.",
      });
    }
    if(user.accountDeactivation) {
      return res.status(403).json({
        status: false,
        message: "Your account is currently deactivated. Kindly verify your account to get started.",
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
          message: `You�ve made too many unsuccessful attempts. Please wait ${waitTime} minute(s) before trying again.`,
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
      user:user.role === "patient" ? {
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        cellphoneNumber: user.cellphoneNumber,
        walletID: user.walletID,
        userId: user._id,
        gender: user.gender,
        isPushNotificationEnabled: user.isPushNotificationEnabled,
        nationalId: user.nationalId,
        dateOfBirth: user.dateOfBirth,
        balance: user.balance,
        profileImage: user.profileImage,
        address: user.address,
        region: user.region,
        town: user.town,
        isAccountVerified: user.isAccountVerified,
      }: {
        fullname: user.fullname,
        email: user.email,
        role: user.role,
        cellphoneNumber: user.cellphoneNumber,
        walletID: user.walletID,
        userId: user._id,
        gender: user.gender,
        isPushNotificationEnabled: user.isPushNotificationEnabled,
        nationalId: user.nationalId,
        dateOfBirth: user.dateOfBirth,
        profileImage: user.profileImage,
        address: user.address,
        region: user.region,
        town: user.town,
        isAccountVerified: user.isAccountVerified,
        isDocumentsSubmitted: user.isDocumentsSubmitted,
        isDocumentVerified: user.isDocumentVerified,
        bio: user.bio,
        hpcnaNumber: user.hpcnaNumber,
        hpcnaExpiryDate: user.hpcnaExpiryDate,
        specializations: user.specializations,
        yearsOfExperience: user.yearsOfExperience,
        operationalZone: user.operationalZone,
        governingCouncil: user.governingCouncil,
        annualQualification: user.annualQualification,
        primaryQualification: user.primaryQualification,
        idDocumentFront: user.idDocumentFront,
        idDocumentBack: user.idDocumentBack,
      }
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
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
        message: "It seems you don�t have an account yet. Please register to get started.",
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
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateProfileImage = async (req, res) => {
  const { id } = req.params;

  let profileImagePath = req.file ? req.file.filename : null;
      
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
        message: "It seems you don�t have an account yet. Please register to get started.",
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
    if(existingUser.role !== "patient"){
      existingUser.isDocumentVerified = false;
    }
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your profile image has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updatePatientDetails = async (req, res) => {
  let userId  = req.params.id;
  const {
      fullname,
      cellphoneNumber,
      email,
      dateOfBirth,
      gender,
      nationalId,
      address,
      town,
      region,
    } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }
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
    if (!gender) {
      return res
        .status(400)
        .json({ message: "Gender is required." });
    }
    if (!nationalId) {
      return res
        .status(400)
        .json({ message: "National ID number is required." });
    }

    if (!isValidCellphoneNumber(cellphoneNumber)) {
      return res.status(400).json({ message: "Oops! That doesn�t look like a valid cellphone number. Please check and try again." });
    }
  try{
    const existingUser = await User.findById(userId);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }
    existingUser.fullname = fullname;
    existingUser.cellphoneNumber = cellphoneNumber;
    existingUser.email =  email;
    existingUser.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : existingUser.dateOfBirth;
    existingUser.gender = gender;
    existingUser.nationalID = nationalId;
    existingUser.address = address;
    existingUser.town = town;
    existingUser.region = region;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your profile details have been updated successfully.",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateHealthProvider = async (req, res) => {
   let userId  = req.params.id;
  let {
      fullname,
      cellphoneNumber,
      email,
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
          return res.status(400).json({ message: "Oops! That doesn�t look like a valid cellphone number. Please check and try again." });
        }
    if (!email) {
      return res
        .status(400)
        .json({ message: "Email is required." });
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
    if (!gender) {
      return res
        .status(400)
        .json({ message: "Gender is required." });
    }
  try{
    const existingUser = await User.findById(userId);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }
    existingUser.fullname = fullname;
    existingUser.cellphoneNumber = cellphoneNumber;
    existingUser.email =  email;
    existingUser.address = address
    existingUser.gender = gender;
    existingUser.bio = bio;
    existingUser.hpcnaNumber = hpcnaNumber;
    existingUser.hpcnaExpiryDate = hpcnaExpiryDate;
    existingUser.specializations = specializations;
    existingUser.yearsOfExperience = yearsOfExperience;
    existingUser.operationalZone = operationalZone;
    existingUser.governingCouncil = governingCouncil;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your profile details have been updated successfully.",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.changePassword = async (req, res) => {
  let userId  = req.params.id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!userId) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }
     if (!currentPassword) {
      return res
        .status(400)
        .json({ message: "Current password is required." });
    }
     if (!newPassword) {
      return res
        .status(400)
        .json({ message: "New password is required." });
    }
    if (!confirmPassword) {
      return res
        .status(400)
        .json({ message: "Confirm password is required." });
    }
    if(currentPassword.toLowerCase() === newPassword.toLowerCase()) {
      return res
        .status(400)
        .json({ message: "New password must be different from the current password." });
    }
    if( newPassword.toLowerCase() !== confirmPassword.toLowerCase()) {
      return res
        .status(400)
        .json({ message: "New password and confirm password do not match." });
    }
    const result = validatePassword(newPassword);
    
        if (!result.valid) {
      
            return res
                    .status(400)
                    .json({ message: result?.message });
            }
  try{
    const existingUser = await User.findById(userId);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, existingUser.password);
    if (!isMatch) {
      return res.status(401).json({
        status: false,
        message: "The current password you entered is incorrect. Please try again.",
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    existingUser.password = hashedPassword;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your password has been changed successfully.",
    });
  }catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateIDFront = async (req, res) => {
   const { id } = req.params;

  let imagePath = req.file ? req.file.filename : null;
      
if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }

    if (!imagePath) {
      return res
        .status(400)
        .json({ message: "ID front is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }
    
    if (existingUser.idDocumentFront) {
      const oldImagePath = path.join("public", "images", existingUser.idDocumentFront);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.idDocumentFront = imagePath;
    existingUser.isDocumentVerified = false;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your ID front has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateIDBack = async (req, res) => {
   const { id } = req.params;

  let imagePath = req.file ? req.file.filename : null;
      
if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }

    if (!imagePath) {
      return res
        .status(400)
        .json({ message: "ID back is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }
    if (existingUser.idDocumentBack) {
      const oldImagePath = path.join("public", "images", existingUser.idDocumentBack);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.idDocumentBack = imagePath;
    existingUser.isDocumentVerified = false;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your ID back has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updatePrimaryQualification = async (req, res) => {
   const { id } = req.params;

  let imagePath = req.file ? req.file.filename : null;
      
if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }

    if (!imagePath) {
      return res
        .status(400)
        .json({ message: "Primary qualification is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }
    if(existingUser.role === "patient"){
      return res.status(403).json({
        message: "This feature isn�t available for your role. Please contact support if you think this is a mistake.",
      });
    }
    if (existingUser.primaryQualification) {
      const oldImagePath = path.join("public", "images", existingUser.primaryQualification);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.primaryQualification = imagePath;
    existingUser.isDocumentVerified = false;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your primary qualification has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updatePrescribingCertificate = async (req, res) => {
   const { id } = req.params;

  let imagePath = req.file ? req.file.filename : null;
      
if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }

    if (!imagePath) {
      return res
        .status(400)
        .json({ message: "Prescribing Certificate is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }

    if(existingUser.role !== "nurse"){
      return res.status(403).json({
        message: "This feature isn�t available for your role. Please contact support if you think this is a mistake.",
      });
    }
    if (existingUser.prescribingCertificate) {
      const oldImagePath = path.join("public", "images", existingUser.prescribingCertificate);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.prescribingCertificate = imagePath;
    existingUser.isDocumentVerified = false;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your prescribing certificate has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.updateAnnualQualification = async (req, res) => {
   const { id } = req.params;

  let imagePath = req.file ? req.file.filename : null;
      
if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }

    if (!imagePath) {
      return res
        .status(400)
        .json({ message: "Annual qualification is required." });
    }
    
  try{
    const existingUser = await User.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don�t have an account yet. Please register to get started.",
      });
    }
    if(existingUser.role === "patient"){
      return res.status(403).json({
        message: "This feature isn�t available for your role. Please contact support if you think this is a mistake.",
      });
    }
    if (existingUser.annualQualification) {
      const oldImagePath = path.join("public", "images", existingUser.annualQualification);

      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.annualQualification = imagePath;
    existingUser.isDocumentVerified = false;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your annual qualification has been updated successfully",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We�re having trouble processing your request. Please try again shortly.", error });
  }
}

exports.getAllAppUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password -verifiedCellphoneNumber').sort({ createdAt: -1 });
    res.status(200).json({ status: true, users });
  } catch (error) {
    console.error("Error fetching app users:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.deactivateAccount = async (req, res) => {
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
        message: "It seems you don't have an account yet. Please register to get started.",
      });
    }
    existingUser.accountDeactivation = true;
    await existingUser.save();
    res.status(200).json({
      status: true,
      message: "Your account has been deactivated successfully.",
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
}

exports.approveHealthProviderDocuments = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }
  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    // Check if user is a health provider or patient
    const healthProviderRoles = ["doctor", "nurse", "physiotherapist", "social worker"];
    const isHealthProvider = healthProviderRoles.includes(existingUser.role);
    const isPatient = existingUser.role === "patient";

    if (!isHealthProvider && !isPatient) {
      return res.status(400).json({
        message: "Document verification is only available for patients and health providers.",
      });
    }

    // For health providers, check if documents are submitted
    if (isHealthProvider && !existingUser.isDocumentsSubmitted) {
      return res.status(400).json({
        message: "Documents have not been submitted yet.",
      });
    }

    // For patients, check if ID documents and profile image are present
    if (isPatient) {
      if (!existingUser.idDocumentFront || !existingUser.idDocumentBack || !existingUser.profileImage) {
        return res.status(400).json({
          message: "Patient must have ID front, ID back, and profile image submitted.",
        });
      }
    }

    // Approve documents
    existingUser.isDocumentVerified = true;
    await existingUser.save();

    // Send approval notification
    const message = isHealthProvider
      ? `Congratulations ${existingUser.fullname}! Your documents have been verified and approved. You can now start providing services on the platform.`
      : `Congratulations ${existingUser.fullname}! Your documents have been verified and approved. Your account is now fully verified.`;

    await Notification.createNotification({
      userId: existingUser._id,
      type: "alert",
      title: "Document Verification Approved",
      status: "sent",
      message: message,
      priority: "high",
    });

    res.status(200).json({
      status: true,
      message: isHealthProvider 
        ? "Health provider documents approved successfully."
        : "Patient documents approved successfully.",
      user: existingUser,
    });
  } catch (error) {
    console.error("Error approving documents:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.rejectHealthProviderDocuments = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }
  if (!reason || reason.trim() === "") {
    return res.status(400).json({ message: "Rejection reason is required." });
  }
  
  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    // Check if user is a health provider or patient
    const healthProviderRoles = ["doctor", "nurse", "physiotherapist", "social worker"];
    const isHealthProvider = healthProviderRoles.includes(existingUser.role);
    const isPatient = existingUser.role === "patient";

    if (!isHealthProvider && !isPatient) {
      return res.status(400).json({
        message: "Document verification is only available for patients and health providers.",
      });
    }

    // Reject documents (set isDocumentVerified to false)
    const wasVerified = existingUser.isDocumentVerified;
    existingUser.isDocumentVerified = false;
    await existingUser.save();

    // Send rejection notification with reason
    const rejectionMessage = wasVerified
      ? `Dear ${existingUser.fullname}, your previously approved document verification has been rejected by the admin. Reason: ${reason}. Please review your documents and contact support if you have any questions.`
      : `Dear ${existingUser.fullname}, your document verification has been rejected. Reason: ${reason}. Please review your documents and resubmit them for verification.`;

    await Notification.createNotification({
      userId: existingUser._id,
      type: "alert",
      title: wasVerified ? "Document Verification Revoked" : "Document Verification Rejected",
      status: "sent",
      message: rejectionMessage,
      priority: "high",
      data: {
        rejectionReason: reason,
      },
    });

    res.status(200).json({
      status: true,
      message: isHealthProvider
        ? "Health provider documents rejected successfully. Notification sent to user."
        : "Patient documents rejected successfully. Notification sent to user.",
      user: existingUser,
    });
  } catch (error) {
    console.error("Error rejecting documents:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.updatePushToken = async (req, res) => {
  const { id } = req.params;
  const { pushToken } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }
  if (!pushToken) {
    return res.status(400).json({ message: "Push token is required." });
  }

  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    existingUser.expoPushToken = pushToken;
    existingUser.isPushNotificationEnabled = true;
    await existingUser.save();

    res.status(200).json({
      status: true,
      message: "Push token updated successfully.",
    });
  } catch (error) {
    console.error("Error updating push token:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};
