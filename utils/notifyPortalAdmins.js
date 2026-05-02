const NotificationPortal = require("../models/notificationPortal");
const PortalUser = require("../models/userPortal");

async function notifyAllPortalAdmins({ title, description }) {
  try {
    const admins = await PortalUser.find().select("_id");
    if (!admins.length) return;
    await NotificationPortal.insertMany(
      admins.map((admin) => ({
        userId: admin._id,
        title,
        description,
        read: false,
      })),
    );
  } catch (err) {
    console.error("notifyAllPortalAdmins failed:", err);
  }
}

module.exports = { notifyAllPortalAdmins };
