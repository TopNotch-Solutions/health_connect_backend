const NotificationPortal = require("../../models/notificationPortal");
const PortalUser = require("../../models/userPortal");
const Notification = require("../../models/notification");
const User = require("../../models/user");

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

// Send notification to all app users
exports.sendNotificationToAllUsers = async (req, res) => {
  const { title, message, type } = req.body;
  
  if (!title) {
    return res.status(400).json({ message: "Title is required." });
  }
  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    // Get all app users
    const allUsers = await User.find().select('_id');
    
    if (allUsers.length === 0) {
      return res.status(404).json({ message: "No app users found." });
    }

    // Create notifications for all users
    const notifications = allUsers.map(user => ({
      userId: user._id,
      type: type || "alert",
      title,
      message,
      status: "sent",
    }));

    // Insert all notifications
    await Notification.insertMany(notifications);

    res.status(201).json({ 
      status: true, 
      message: `Notification sent successfully to ${allUsers.length} users.`,
      data: { count: allUsers.length }
    });
  } catch (error) {
    console.error("Error sending notification to all users:", error);
    res.status(500).json({ 
      message: "We're having trouble processing your request. Please try again shortly.", 
      error: error.message 
    });
  }
};

// Send notification to a single app user
exports.sendNotificationToUser = async (req, res) => {
  const { userId, title, message, type } = req.body;
  
  if (!userId) {
    return res.status(400).json({ message: "User ID is required." });
  }
  if (!title) {
    return res.status(400).json({ message: "Title is required." });
  }
  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "App user not found." });
    }

    // Create notification
    const notification = await Notification.createNotification({
      userId,
      type: type || "alert",
      title,
      message,
      status: "sent",
    });

    res.status(201).json({ 
      status: true, 
      message: "Notification sent successfully.",
      data: notification
    });
  } catch (error) {
    console.error("Error sending notification to user:", error);
    res.status(500).json({ 
      message: "We're having trouble processing your request. Please try again shortly.", 
      error: error.message 
    });
  }
};

