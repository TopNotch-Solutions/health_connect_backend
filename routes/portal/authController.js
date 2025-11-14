const { Router } = require('express');
const { create_portal_user, login, getAllPortalUsers, getDashboardStats, updatePortalUser, updatePortalUserPassword, updatePortalUserProfileImage } = require('../../controllers/portal/authController');
const { uploadSingle } = require('../../middlewares/uploadProfileImage');

const authPortalRouter = Router();

// Multer error handler middleware - must have 4 parameters to be recognized as error handler
const handleMulterError = (err, req, res, next) => {
  if (err) {
    console.error('Multer error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        status: false,
        message: 'File size is too large. Please upload an image smaller than 5MB.' 
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        status: false,
        message: 'Unexpected file field. Please use "profileImage" as the field name.' 
      });
    }
    return res.status(400).json({ 
      status: false,
      message: err.message || 'File upload error occurred.' 
    });
  }
  next();
};

authPortalRouter.post('/create-portal-user', create_portal_user);
authPortalRouter.post('/login', login);
authPortalRouter.get('/all-users', getAllPortalUsers);
authPortalRouter.get('/dashboard-stats', getDashboardStats);
authPortalRouter.put('/update-user/:id', updatePortalUser);
authPortalRouter.put('/update-password/:id', updatePortalUserPassword);
authPortalRouter.patch('/upload-profile-image/:id', uploadSingle, handleMulterError, updatePortalUserProfileImage);

module.exports = authPortalRouter;