const { Router } = require('express');
const authRouter = Router();
const { sendOtp } = require('../../controllers/common/authController');
const { verifyOtp } = require('../../controllers/common/authController');
const { appTokenMiddleware, checkAppUser } = require('../../middlewares/authMiddleware');

authRouter.post('/send-otp',appTokenMiddleware, checkAppUser, sendOtp);
authRouter.post('/verify-otp',appTokenMiddleware, checkAppUser, verifyOtp);

module.exports = authRouter;