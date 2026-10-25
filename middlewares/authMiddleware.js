const jwt = require('jsonwebtoken');
require('dotenv').config();


const extractToken = (authHeader) => {
  if (!authHeader) return null;
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  return parts[1];
};

const getHeader = (req, ...names) => {
  for (const name of names) {
    const val = req.header(name);
    if (val) return val;
  }
  return undefined;
};

module.exports.tokenAuthMiddleware = (req, res, next) => {
  const authHeader = getHeader(req, 'x-access-token', 'authorization', 'Authorization');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please sign in again to continue.",
    });
  }

  const token = extractToken(authHeader);
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please sign in again to continue.",
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
          ? "Your session has expired. Please sign in again."
          : "Please sign in again to continue.",
    });
  }
};

// NOTE: this one deliberately keeps returning 400 with "Invalid token.".
// The app detects exactly that pair to know it should refetch the bootstrap
// token and retry (see AuthContext login). Changing it would break sign-in
// for every already-installed version of the app.
module.exports.appTokenMiddleware = (req, res, next) => {
  // Bootstrap / pre-login routes must use the app token only.
  // Do not fall back to Authorization — that header carries the user session JWT.
  const authHeader = getHeader(req, 'data-access-token');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please wait a moment and try again.",
    });
  }

  const token = extractToken(authHeader);
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please wait a moment and try again.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (err) {
    // Keep exact "Invalid token." + 400 — the app refreshes the bootstrap token on this pair.
    res.status(400).json({
      status: "FAILURE",
      message: "Invalid token.",
    });
  }
};


// Guards the admin portal API. Verifies a JWT issued by the portal login
// (see controllers/portal/authController.js). Uses PORTAL_TOKEN as the
// signing secret, falling back to MOBILE_TOKEN so no new env var is
// strictly required to deploy.
module.exports.portalAuthMiddleware = (req, res, next) => {
  const authHeader = getHeader(req, 'x-access-token', 'authorization', 'Authorization');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No Authorization header provided.",
    });
  }

  const token = extractToken(authHeader);
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Access denied. No token provided.",
    });
  }

  try {
    const secretKey = process.env.PORTAL_TOKEN || process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey);

    // Only tokens minted by the portal login carry this flag. Mobile-app
    // tokens verify with the same fallback secret, so the flag is what
    // stops an app user from reaching admin routes.
    if (decoded.portal !== true) {
      return res.status(403).json({
        status: "FAILURE",
        message: "Access denied. User does not have access to this route.",
      });
    }

    req.portalUser = decoded;
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

module.exports.checkUser = (req, res, next) => {
  // tokenAuthMiddleware already verified the JWT when used as a pair —
  // reuse req.user so we don't depend on the header being readable twice.
  if (req.user?.id || req.user?._id) {
    const role = String(req.user.role || "").toLowerCase();
    const allowed = [
      "patient",
      "doctor",
      "nurse",
      "physiotherapist",
      "social worker",
      "pharmacist",
    ];
    if (!allowed.includes(role)) {
      return res.status(403).json({
        status: "FAILURE",
        message: "You do not have access to this action.",
      });
    }
    return next();
  }

  const authHeader = getHeader(req, 'x-access-token', 'authorization', 'Authorization');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please sign in again to continue.",
    });
  }

  const token = extractToken(authHeader);
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please sign in again to continue.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey); 
    if (decoded.role !== 'patient' && decoded.role !== 'doctor' && decoded.role !== 'nurse' && decoded.role !== 'physiotherapist' && decoded.role !== 'social worker' && decoded.role !== 'pharmacist') {
      return res.status(403).json({
        status: "FAILURE",
        message: "You do not have access to this action.",
      });
    }

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      status: "FAILURE",
      message:
        err.name === "TokenExpiredError"
          ? "Your session has expired. Please sign in again."
          : "Please sign in again to continue.",
    });
  }
};

module.exports.checkAppUser = (req, res, next) => {
  // appTokenMiddleware already verified the bootstrap JWT when used as a pair.
  if (req.user?.role === "appUser") {
    return next();
  }

  const authHeader = getHeader(req, 'data-access-token');
  if (!authHeader) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please wait a moment and try again.",
    });
  }

  const token = extractToken(authHeader);
  if (!token) {
    return res.status(401).json({
      status: "FAILURE",
      message: "Please wait a moment and try again.",
    });
  }

  try {
    const secretKey = process.env.MOBILE_TOKEN;
    const decoded = jwt.verify(token, secretKey); 
    if (decoded.role !== 'appUser') {
      return res.status(403).json({
        status: "FAILURE",
        message: "You do not have access to this action.",
      });
    }

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(400).json({
      status: "FAILURE",
      message: "Invalid token.",
    });
  }
};