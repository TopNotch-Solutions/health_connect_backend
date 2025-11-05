const { Router } = require('express');
const { registerPatient, registerHealthProvider, verifyOtpReset, resetPassword, login, removeProfileImage, updateProfileImage } = require('../../controllers/app/authController');
const { uploadSingle } = require('../../middlewares/uploadProfileImage');
const { uploadMultipleDocuments } = require('../../middlewares/uploadHealthProviderImages');
const authRouter = Router();

authRouter.post("/register-patient", uploadSingle, registerPatient);
authRouter.post("/register-health-provider", uploadMultipleDocuments, registerHealthProvider);
authRouter.post("/forgot-password-verify-otp", verifyOtpReset);
authRouter.post("/forgot-password-reset", resetPassword);
authRouter.post("/login", login);
authRouter.delete("/remove-profile-image/:id", removeProfileImage);
authRouter.patch("/upload-profile-image/:id", updateProfileImage);

module.exports = authRouter;