const { Router } = require('express');
const authRouter = Router();
const { sendOtp } = require('../../controllers/common/authController');
const { verifyOtp } = require('../../controllers/common/authController');

authRouter.post('/send-otp', sendOtp);
authRouter.post('/verify-otp', verifyOtp);

module.exports = authRouter;