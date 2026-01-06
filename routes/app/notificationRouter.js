const { Router } = require('express');
const { getAllNotification, getUnReadCount, markNotificationsAsRead, deleteNotifications } = require('../../controllers/app/notificationController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');
const notificationRouter = Router();

notificationRouter.get("/all-user-notification/:id",tokenAuthMiddleware,checkUser, getAllNotification);
notificationRouter.get("/unread-count/:id",tokenAuthMiddleware,checkUser, getUnReadCount);
notificationRouter.patch("/mark-as-read/:id",tokenAuthMiddleware,checkUser, markNotificationsAsRead);
notificationRouter.delete("/delete-notification/:id",tokenAuthMiddleware,checkUser, deleteNotifications);

module.exports = notificationRouter;