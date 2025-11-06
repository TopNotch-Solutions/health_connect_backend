const { Router } = require('express');
const { registerPatient, registerHealthProvider, verifyOtpReset, resetPassword, login, removeProfileImage, updateProfileImage, updateIDFront, updateIDBack, updateAnnualQualification, updatePrimaryQualification, updatePatientDetails, updateHealthProvider, changePassword, deactivateAccount } = require('../../controllers/app/authController');
const { uploadSingle } = require('../../middlewares/uploadProfileImage');
const { uploadMultipleDocuments } = require('../../middlewares/uploadHealthProviderImages');
const uploadIdFront = require('../../middlewares/uploadIdFront');
const uploadannualQualification = require('../../middlewares/uploadannualQualification');
const uploadprimaryQualification = require('../../middlewares/uploadprimaryQualification');
const { uploadSingleBack } = require('../../middlewares/uploadIdBack');
const authRouter = Router();

authRouter.post("/register-patient", uploadSingle, registerPatient);
authRouter.post("/register-health-provider", uploadMultipleDocuments, registerHealthProvider);
authRouter.post("/forgot-password-verify-otp", verifyOtpReset);
authRouter.post("/forgot-password-reset/:id", resetPassword);
authRouter.post("/login", login);
authRouter.delete("/remove-profile-image/:id", removeProfileImage);
authRouter.put("/update-patient-details/:id", updatePatientDetails);
authRouter.patch("/change-password/:id", changePassword);
authRouter.patch("/deactivate-account/:id", deactivateAccount);
authRouter.put("/update-health-provider-details/:id", updateHealthProvider);
authRouter.patch("/upload-profile-image/:id",uploadSingle, updateProfileImage);
authRouter.patch("/update-id-front/:id",uploadIdFront.uploadSingleFront, updateIDFront);
authRouter.patch("/update-id-back/:id", uploadSingleBack, updateIDBack);
authRouter.patch("/update-annual-qualification/:id", uploadannualQualification.uploadSingleAnnual, updateAnnualQualification);
authRouter.patch("/update-primary-qualification/:id", uploadprimaryQualification.uploadSinglePrimary, updatePrimaryQualification);

module.exports = authRouter;