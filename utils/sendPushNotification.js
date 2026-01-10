const admin = require('../config/firebase');
/**
 * Send push notification via Firebase Cloud Messaging
 * @param {string} fcmToken - Device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data] - Optional custom data payload
 */
const sendPushNotifications = async (fcmToken, title, body, data) => {
  console.log("Sending push notification to token:", fcmToken, "with title:", title, "and body:", body);
  if (!fcmToken) {
    console.warn("FCM token missing");
    return;
  }

  const message = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
  };

  // Attach data only if provided
  if (data && Object.keys(data).length > 0) {
    message.data = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)])
    );
  }

  try {
    const response = await admin.messaging().send(message);
    console.log("Push notification sent:", response);
    return response;
  } catch (error) {
    console.error("Push notification error:", error.message);
    throw error;
  }
};

module.exports = sendPushNotifications;