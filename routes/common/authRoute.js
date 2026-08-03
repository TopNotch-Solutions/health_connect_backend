const { Router } = require('express');
const authRouter = Router();
const {
  sendOtp,
  verifyOtp,
  checkAccountExists,
} = require('../../controllers/common/authController');
const { appTokenMiddleware, checkAppUser } = require('../../middlewares/authMiddleware');

authRouter.post('/send-otp',appTokenMiddleware, checkAppUser, sendOtp);
authRouter.post('/verify-otp',appTokenMiddleware, checkAppUser, verifyOtp);
authRouter.post('/check-account', checkAccountExists);

module.exports = authRouter;