const PortalUser = require("../models/userPortal");

/**
 * Middleware to check user permissions
 * @param {string} requiredPermission - 'read', 'write', or 'delete'
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Get user ID from request body, headers, or params
      const userId = req.body?.userId || req.headers['user-id'] || req.params?.userId || req.user?.id || req.user?._id;
      
      if (!userId) {
        // If no user ID provided, allow the request but log a warning
        // In production, you might want to require authentication
        console.warn("No user ID provided for permission check. Allowing request.");
        return next();
      }

      // Fetch user from database
      const user = await PortalUser.findById(userId).select('permissions role');
      
      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found.",
        });
      }

      // Super admin has all permissions
      if (user.role === 'super admin') {
        req.userPermissions = {
          read: true,
          write: true,
          delete: true,
        };
        return next();
      }

      // Check if user has the required permission
      const userPermissions = user.permissions || {
        read: true,
        write: false,
        delete: false,
      };

      const hasPermission = userPermissions[requiredPermission] === true;

      if (!hasPermission) {
        return res.status(403).json({
          status: false,
          message: `You do not have ${requiredPermission} permission to perform this action.`,
        });
      }

      // Attach permissions to request for use in controllers
      req.userPermissions = userPermissions;
      next();
    } catch (error) {
      console.error("Error checking permissions:", error);
      res.status(500).json({
        status: false,
        message: "Error checking permissions. Please try again.",
      });
    }
  };
};

module.exports = {
  checkPermission,
  requireRead: () => checkPermission('read'),
  requireWrite: () => checkPermission('write'),
  requireDelete: () => checkPermission('delete'),
};

