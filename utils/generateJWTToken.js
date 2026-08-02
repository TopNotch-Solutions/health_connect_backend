const jwt = require("jsonwebtoken");
require('dotenv').config();

// The app has no inactivity timeout and there is no refresh flow, so this
// value alone bounds how long a session — or a stolen token — stays valid.
// Override with JWT_EXPIRES_IN (e.g. "8h", "7d") without a code change.
const LOGIN_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

// The bootstrap token only reaches pre-login endpoints (register, login,
// forgot-password). The app refetches it automatically when it is rejected.
const APP_TOKEN_EXPIRES_IN = process.env.APP_JWT_EXPIRES_IN || "24h";

const loginToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.MOBILE_TOKEN,
    { expiresIn: LOGIN_TOKEN_EXPIRES_IN },
  );
};

const appUserToken = () => {
  return jwt.sign(
    { role: 'appUser' },
    process.env.MOBILE_TOKEN,
    { expiresIn: APP_TOKEN_EXPIRES_IN },
  );
};

module.exports = {
  loginToken,
  appUserToken,
}