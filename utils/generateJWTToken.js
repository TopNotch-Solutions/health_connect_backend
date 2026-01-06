const jwt = require("jsonwebtoken");
require('dotenv').config();

const loginToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.MOBILE_TOKEN,
     {
      expiresIn: '1d',
    }
  );
};

const appUserToken = () => {
  return jwt.sign(
    { role: 'appUser' },
    process.env.MOBILE_TOKEN,
  );
};

module.exports = {
  loginToken,
  appUserToken,
}