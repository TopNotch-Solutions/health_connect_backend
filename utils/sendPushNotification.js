const admin = require("../config/firebase");

/**
 * Send push notification via Firebase Admin.
 * @param {string} pushToken - FCM device token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data] - Optional custom data payload
 */
const sendPushNotifications = async (pushToken, title, body, data = {}) => {
  console.log(
    "Sending push notification to token:",
    pushToken,
    "with title:",
    title,
    "and body:",
    body,
  );

  if (!pushToken) {
    console.warn("FCM token missing");
    return null;
  }

  const message = {
    token: pushToken,
    notification: {
      title,
      body,
    },
  };

  if (data && Object.keys(data).length > 0) {
    message.data = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)]),
    );
  }

  try {
    const response = await admin.messaging().send(message);
    console.log("Push notification sent:", response);
    return response;
  } catch (error) {
    console.error("Push notification error:", error.message);
    return null;
  }
};

module.exports = sendPushNotifications;