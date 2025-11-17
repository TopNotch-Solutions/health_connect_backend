const { Router } = require('express');
const {
  getAllPortalNotifications,
  getUnreadPortalCount,
  markPortalNotificationAsRead,
  deletePortalNotification,
  createPortalNotification,
  sendNotificationToAllUsers,
  sendNotificationToUser
} = require('../../controllers/portal/notificationController');

const notificationPortalRouter = Router();

notificationPortalRouter.get('/all-notifications/:id', getAllPortalNotifications);
notificationPortalRouter.get('/unread-count/:id', getUnreadPortalCount);
notificationPortalRouter.put('/mark-read/:id', markPortalNotificationAsRead);
notificationPortalRouter.delete('/delete/:id', deletePortalNotification);
notificationPortalRouter.post('/create', createPortalNotification);
notificationPortalRouter.post('/send-to-all-users', sendNotificationToAllUsers);
notificationPortalRouter.post('/send-to-user', sendNotificationToUser);

module.exports = notificationPortalRouter;

