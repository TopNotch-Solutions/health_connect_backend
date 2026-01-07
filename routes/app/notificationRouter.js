const { Router } = require('express');
const { getAllNotification, getUnReadCount, markNotificationsAsRead, deleteNotifications } = require('../../controllers/app/notificationController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');
const notificationRouter = Router();

notificationRouter.get("/all-user-notification",tokenAuthMiddleware,checkUser, getAllNotification);
notificationRouter.get("/unread-count",tokenAuthMiddleware,checkUser, getUnReadCount);
notificationRouter.patch("/mark-as-read",tokenAuthMiddleware,checkUser, markNotificationsAsRead);
notificationRouter.delete("/delete-notification/:id",tokenAuthMiddleware,checkUser, deleteNotifications);

module.exports = notificationRouter;