const Notification = require("../../models/notification");
const User = require("../../models/user");

exports.getAllNotification = async (req, res) => {
  const id = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  if (!id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  try {
    // Validate user
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "It seems you don’t have an account yet. Please register to get started."
      });
    }

    // Convert page & limit to numbers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    if (pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({
        message: "Page and limit must be positive numbers"
      });
    }

    // Pagination calculations
    const skip = (pageNumber - 1) * limitNumber;

    // Total notifications count
    const totalNotifications = await Notification.countDocuments({
      userId: id
    });

    // Fetch paginated notifications
    const notifications = await Notification.find({ userId: id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const totalPages = Math.ceil(totalNotifications / limitNumber);

    return res.status(200).json({
      status: true,
      message: "User notifications retrieved",
      data: notifications,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalNotifications,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      }
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      message: "We’re having trouble processing your request. Please try again shortly.",
      error
    });
  }
};

exports.getUnReadCount = async (req, res) => {
    const id  = req.user.id;
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
  const id  = req.user.id;

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

  if (!id) {
    return res.status(400).json({ message: "Notification ID is required." });
  }

  try {

    const deletedNotification = await Notification.findByIdAndDelete(id);

    if (!deletedNotification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.status(200).json({ status: true, message: "Notification deleted successfully." });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({ message: "We’re having trouble processing your request. Please try again shortly.", error });
  }
};
