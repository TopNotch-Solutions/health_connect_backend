const Notification = require("../../models/notification");
const User = require("../../models/user");

exports.getAllNotification = async (req, res) => {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }
    try{
        const existingUser = await User.findById(id);
        if (!existingUser) {
          return res
            .status(404)
            .json({ message: "It seems you don’t have an account yet. Please register to get started." });
        }
        const notifications = await Notification.find({ userId: id }).sort({ createdAt: -1 });
        res.status(200).json({ status: true, data: notifications });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
exports.getUnReadCount = async (req, res) => {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ message: "User ID is required." });
    }
    try{
        const existingUser = await User.findById(id);
        if (!existingUser) {
          return res
            .status(404)
            .json({ message: "It seems you don’t have an account yet. Please register to get started." });
        }
        const unReadCount = await Notification.countDocuments({ userId: id, status: { $ne: "read" } });
        res.status(200).json({ status: true, data: { unReadCount } });
    }catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
exports.markNotificationsAsRead = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don’t have an account yet. Please register to get started.",
      });
    }

    const notifications = await Notification.find({
      userId: id,
    });

    if (!notifications || notifications.length === 0) {
      return res.status(404).json({ message: "No matching notifications found." });
    }
    await Notification.updateMany(
      { userId: id },
      { $set: { status: "read", readAt: new Date() } }
    );

    res.status(200).json({ status: true, message: "Notifications marked as read." });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({
      message: "We’re having trouble processing your request. Please try again shortly.",
      error,
    });
  }
};

exports.deleteNotifications = async (req, res) => {
  const { id } = req.params;
  const { notificationIds } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
    return res.status(400).json({ message: "Notification IDs are required." });
  }

  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ message: "It seems you don’t have an account yet. Please register to get started." });
    }

    const notifications = await Notification.find({ _id: { $in: notificationIds }, userId: id });
    if (!notifications || notifications.length === 0) {
      return res.status(404).json({ message: "No matching notifications found." });
    }

    await Notification.deleteMany({ _id: { $in: notificationIds }, userId: id });

    res.status(200).json({ status: true, message: "Notifications deleted successfully." });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
