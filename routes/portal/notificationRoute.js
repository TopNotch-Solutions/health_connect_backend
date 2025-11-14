const { Router } = require('express');
const {
  getAllPortalNotifications,
  getUnreadPortalCount,
  markPortalNotificationAsRead,
  deletePortalNotification,
  createPortalNotification
} = require('../../controllers/portal/notificationController');

const notificationPortalRouter = Router();

notificationPortalRouter.get('/all-notifications/:id', getAllPortalNotifications);
notificationPortalRouter.get('/unread-count/:id', getUnreadPortalCount);
notificationPortalRouter.put('/mark-read/:id', markPortalNotificationAsRead);
notificationPortalRouter.delete('/delete/:id', deletePortalNotification);
notificationPortalRouter.post('/create', createPortalNotification);

module.exports = notificationPortalRouter;

