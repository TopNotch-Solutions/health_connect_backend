const LoginAttemptPortalUser = require("../../models/loginAttemptPortal");
const PortalUser = require("../../models/userPortal");
const User = require("../../models/user");
const { isValidCellphoneNumber } = require("../../utils/cellphoneNumberValidation");
const { validatePassword } = require("../../utils/validatePassword");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path")

exports.create_portal_user = async (req, res) => {
    const { firstName, lastName, cellphoneNumber, email, password, role, profileImage, addedBy,department } = req.body;
    if (!firstName) {
      return res
        .status(400)
        .json({ message: "First name is required." });
    }
    if (!lastName) {
      return res
        .status(400)
        .json({ message: "Last name is required." });
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
    if (!department) {
      return res
        .status(400)
        .json({ message: "Role is required." });
    }
    try {
      const existingUser = await PortalUser.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "A user with this email already exists." });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new PortalUser({
        firstName,
        lastName,
        cellphoneNumber,
        email,
        password: hashedPassword, 
        role,
        department,
        profileImage: profileImage || null,
        addedBy: addedBy || "Testing Admin",
      });
      await newUser.save();
      res.status(201).json({ message: "Portal user created successfully" });
    } catch (error) {
        console.error("Error creating portal user:", error);
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
    const user = await PortalUser.findOne({ email, });

    if (!user) {
      return res.status(404).json({
        message: "We couldn’t sign you in. Please check your username and password, then try again.",
      });
    }

    let loginAttempt = await LoginAttemptPortalUser.findOne({ userId: user._id });
    if (!loginAttempt) {
      loginAttempt = await LoginAttemptPortalUser.create({ userId: user._id, attempts: 0 });
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
      await LoginAttemptPortalUser.updateOne(
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
      const numberOfAffectedRows = await LoginAttemptPortalUser.updateOne(
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

    const updatedLoginAttempt = await LoginAttemptPortalUser.findOne({ userId: user._id });
    if (updatedLoginAttempt) {
      console.log(
        `[LOGIN SUCCESS] LoginAttempt state AFTER successful login for userId: ${user.id}, attempts: ${updatedLoginAttempt.attempts}, lastAttempt: ${updatedLoginAttempt.lastAttempt}`
      );
      loginAttempt = updatedLoginAttempt;
    } else {
      console.warn(
        `[LOGIN SUCCESS] LoginAttempt record NOT FOUND for userId: ${user.id} after successful login. Creating one.`
      );
      loginAttempt = await LoginAttemptPortalUser.create({ userId: user._id, attempts: 0 });
    }
     return res.status(200).json({
      status: true,
      message: "You have logged in successfully.",
      user
    });
  }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
}

exports.getAllPortalUsers = async (req, res) => {
  try {
    const users = await PortalUser.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({ status: true, users });
  } catch (error) {
    console.error("Error fetching portal users:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Get app users statistics
    const totalUsers = await User.countDocuments();
    const patients = await User.countDocuments({ role: "patient" });
    const doctors = await User.countDocuments({ role: "doctor" });
    const nurses = await User.countDocuments({ role: "nurse" });
    const physiotherapists = await User.countDocuments({ role: "physiotherapist" });
    const socialWorkers = await User.countDocuments({ role: "social worker" });
    const healthProviders = doctors + nurses + physiotherapists + socialWorkers;
    
    // Get total unique performing regions (regions with at least one user)
    const regionsWithUsers = await User.distinct("region", { region: { $exists: true, $ne: null, $ne: "" } });
    const totalTowns = regionsWithUsers.length;
    
    // Get user registrations over the last 6 months (app users)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const lineData = monthlyRegistrations.map(item => ({
      name: monthNames[item._id.month - 1],
      count: item.count
    }));

    // Get top performing regions (regions with most users)
    const usersByRegion = await User.aggregate([
      {
        $match: {
          region: { $exists: true, $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: "$region",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      }
    ]);

    const topTowns = usersByRegion.map(item => ({
      primaryIndustry: item._id || "Unknown",
      industryCount: item.count
    }));

    res.status(200).json({
      status: true,
      stats: {
        totalUsers,
        patients,
        healthProviders,
        doctors,
        nurses,
        physiotherapists,
        socialWorkers,
        totalTowns,
        lineData,
        topDepartments: topTowns
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.updatePortalUser = async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, cellphoneNumber, department } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  if (!firstName) {
    return res.status(400).json({ message: "First name is required." });
  }

  if (!lastName) {
    return res.status(400).json({ message: "Last name is required." });
  }

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  if (!cellphoneNumber) {
    return res.status(400).json({ message: "Cellphone number is required." });
  }

  if (!isValidCellphoneNumber(cellphoneNumber)) {
    return res.status(400).json({ message: "Oops! That doesn't look like a valid cellphone number. Please check and try again." });
  }

  if (!department) {
    return res.status(400).json({ message: "Department is required." });
  }

  try {
    const existingUser = await PortalUser.findById(id);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if email is being changed and if it's already taken by another user
    if (email !== existingUser.email) {
      const emailExists = await PortalUser.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return res.status(400).json({ message: "A user with this email already exists." });
      }
    }

    existingUser.firstName = firstName;
    existingUser.lastName = lastName;
    existingUser.email = email;
    existingUser.cellphoneNumber = cellphoneNumber;
    existingUser.department = department;

    await existingUser.save();

    // Return user without password
    const updatedUser = await PortalUser.findById(id).select('-password');

    res.status(200).json({
      status: true,
      message: "Your profile details have been updated successfully.",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error updating portal user:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.updatePortalUserPassword = async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  if (!currentPassword) {
    return res.status(400).json({ message: "Current password is required." });
  }

  if (!newPassword) {
    return res.status(400).json({ message: "New password is required." });
  }

  if (!confirmPassword) {
    return res.status(400).json({ message: "Confirm password is required." });
  }

  if (currentPassword.toLowerCase() === newPassword.toLowerCase()) {
    return res.status(400).json({ message: "New password must be different from the current password." });
  }

  if (newPassword.toLowerCase() !== confirmPassword.toLowerCase()) {
    return res.status(400).json({ message: "New password and confirm password do not match." });
  }

  const result = validatePassword(newPassword);
  if (!result.valid) {
    return res.status(400).json({ message: result?.message });
  }

  try {
    const existingUser = await PortalUser.findById(id);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found." });
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
  } catch (error) {
    console.error("Error updating portal user password:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.updatePortalUserProfileImage = async (req, res) => {
  const { id } = req.params;
  let profileImagePath = req.file ? req.file.filename : null;

  if (!id) {
    return res.status(400).json({ 
      status: false,
      message: "User ID is required." 
    });
  }

  if (!req.file) {
    return res.status(400).json({ 
      status: false,
      message: "Profile image is required. Please select an image file to upload." 
    });
  }

  if (!profileImagePath) {
    return res.status(400).json({ 
      status: false,
      message: "Failed to process the uploaded image. Please try again." 
    });
  }

  try {
    const existingUser = await PortalUser.findById(id);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Delete old profile image if it exists
    if (existingUser.profileImage) {
      const oldImagePath = path.join("public", "images", existingUser.profileImage);
      if (fs.existsSync(oldImagePath)) {
        console.log("Removing previous profile image:", oldImagePath);
        fs.unlinkSync(oldImagePath);
      }
    }

    existingUser.profileImage = profileImagePath;
    await existingUser.save();

    // Return user without password
    const updatedUser = await PortalUser.findById(id).select('-password');

    res.status(200).json({
      status: true,
      message: "Your profile image has been updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error updating portal user profile image:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};