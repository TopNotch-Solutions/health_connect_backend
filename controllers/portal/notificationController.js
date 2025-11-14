const NotificationPortal = require("../../models/notificationPortal");
const PortalUser = require("../../models/userPortal");

exports.getAllPortalNotifications = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res
      .status(400)
      .json({ message: "User ID is required." });
  }
  try {
    const existingUser = await PortalUser.findById(id);
    if (!existingUser) {
      return res
        .status(404)
        .json({ message: "It seems you don't have an account yet. Please register to get started." });
    }
    const notifications = await NotificationPortal.find({ userId: id }).sort({ createdAt: -1 });
    res.status(200).json({ status: true, data: notifications });
  } catch (error) {
    console.error("Error fetching portal notifications:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.getUnreadPortalCount = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res
      .status(400)
      .json({ message: "User ID is required." });
  }
  try {
    const existingUser = await PortalUser.findById(id);
    if (!existingUser) {
      return res
        .status(404)
        .json({ message: "It seems you don't have an account yet. Please register to get started." });
    }
    const unReadCount = await NotificationPortal.countDocuments({ userId: id, read: false });
    res.status(200).json({ status: true, data: { unReadCount } });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.markPortalNotificationAsRead = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res
      .status(400)
      .json({ message: "Notification ID is required." });
  }
  try {
    const notification = await NotificationPortal.findByIdAndUpdate(
      id,
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }
    res.status(200).json({ status: true, message: "Notification marked as read.", data: notification });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.deletePortalNotification = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res
      .status(400)
      .json({ message: "Notification ID is required." });
  }
  try {
    const notification = await NotificationPortal.findByIdAndDelete(id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }
    res.status(200).json({ status: true, message: "Notification deleted successfully." });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

exports.createPortalNotification = async (req, res) => {
  const { userId, title, description } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required." });
  }
  if (!title) {
    return res.status(400).json({ message: "Title is required." });
  }
  if (!description) {
    return res.status(400).json({ message: "Description is required." });
  }
  try {
    const existingUser = await PortalUser.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found." });
    }
    const notification = new NotificationPortal({
      userId,
      title,
      description,
      read: false,
    });
    await notification.save();
    res.status(201).json({ status: true, message: "Notification created successfully.", data: notification });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ message: "We're having trouble processing your request. Please try again shortly.", error });
  }
};

