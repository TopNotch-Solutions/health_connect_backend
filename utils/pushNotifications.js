const admin = require('../config/firebase');

const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!pushToken) {
      console.log("No push token provided, skipping notification.");
      return;
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
      Object.entries(data).map(([key, value]) => [key, String(value)])
    );
  }

  try {
    const response = await admin.messaging().send(message);
    console.log("Push notification sent:", response);
    return response;
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw error;
  }
};

module.exports = { sendPushNotification };
