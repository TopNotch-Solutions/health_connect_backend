const jwt = require('jsonwebtoken');
require('dotenv').config();


module.exports.tokenAuthMiddleware = (req, res, next) => {
  const authHeader = req.header('x-access-token');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No Authorization header provided.",
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No token provided.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (err) {
    // 401 (not 400) so the app's response interceptor clears the stored
    // session and returns the user to sign-in. A 400 was silently ignored.
    res.status(401).json({
      status: "FAILURE",
      message:
        err.name === "TokenExpiredError"
          ? "Session expired. Please log in again."
          : "Invalid token.",
    });
  }
};

// NOTE: this one deliberately keeps returning 400 with "Invalid token.".
// The app detects exactly that pair to know it should refetch the bootstrap
// token and retry (see AuthContext login). Changing it would break sign-in
// for every already-installed version of the app.
module.exports.appTokenMiddleware = (req, res, next) => {
  const authHeader = req.header('data-access-token');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No Authorization header provided.",
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No token provided.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({
      status: "FAILURE",
      message: "Invalid token.",
    });
  }
};


module.exports.checkUser = (req, res, next) => {
  const authHeader = req.header('x-access-token');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No Authorization header provided.",
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No token provided.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey); 
    if (decoded.role !== 'patient' && decoded.role !== 'doctor' && decoded.role !== 'nurse' && decoded.role !== 'physiotherapist' && decoded.role !== 'social worker' && decoded.role !== 'pharmacist') {
      return res.status(403).json({
        status: "FAILURE",
        message: "Access denied. User does not have access to this route.",
      });
    }

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      status: "FAILURE",
      message:
        err.name === "TokenExpiredError"
          ? "Session expired. Please log in again."
          : "Invalid token.",
    });
  }
};

module.exports.checkAppUser = (req, res, next) => {
  const authHeader = req.header('data-access-token');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No Authorization header provided.",
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No token provided.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey); 
    if (decoded.role !== 'appUser') {
      return res.status(403).json({
        status: "FAILURE",
        message: "Access denied. User does not have access to this route.",
      });
    }

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Invalid token.",
    });
  }
};