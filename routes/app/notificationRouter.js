const { Router } = require('express');
const { getAllNotification, getUnReadCount, markNotificationsAsRead, deleteNotifications } = require('../../controllers/app/notificationController');
const notificationRouter = Router();

notificationRouter.get("/all-user-notification/:id", getAllNotification);
notificationRouter.get("/unread-count/:id", getUnReadCount);
notificationRouter.patch("/mark-as-read/:id", markNotificationsAsRead);
notificationRouter.delete("/delete-notification/:id", deleteNotifications);

module.exports = notificationRouter;