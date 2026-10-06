const admin = require("../config/firebase");
const User = require("../models/user");

/** Must match the Android channel created in the mobile app. */
const ANDROID_CHANNEL_ID = "healthconnect-alerts-v2";
/** Android res/raw resource name (no extension). */
const ANDROID_SOUND = "healthconnect_alert";

const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const isExpoPushToken = (token) =>
  typeof token === "string" && token.startsWith("ExponentPushToken[");

const clearInvalidPushToken = async (pushToken) => {
  try {
    const result = await User.updateMany(
      { expoPushToken: pushToken },
      { $set: { expoPushToken: null } },
    );
    if (result.modifiedCount > 0) {
      console.warn(
        `Cleared invalid push token from ${result.modifiedCount} user(s)`,
      );
    }
  } catch (error) {
    console.error("Failed to clear invalid push token:", error.message);
  }
};

/**
 * Send via Expo Push API when the stored token is an Expo token.
 */
const sendViaExpo = async (pushToken, title, body, data = {}) => {
  const payload = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
    channelId: ANDROID_CHANNEL_ID,
    priority: "high",
  };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  console.log("Expo push response:", JSON.stringify(result));

  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
  if (ticket?.status === "error") {
    console.error("Expo push error:", ticket.message, ticket.details);
    if (
      ticket.details?.error === "DeviceNotRegistered" ||
      /not (a )?registered/i.test(ticket.message || "")
    ) {
      await clearInvalidPushToken(pushToken);
    }
    return null;
  }

  return result;
};

/**
 * Send an FCM (or Expo) push with sound and high priority.
 */
const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!pushToken) {
    console.log("No push token provided, skipping notification.");
    return null;
  }

  const stringData =
    data && Object.keys(data).length > 0
      ? Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)]),
        )
      : undefined;

  // Legacy / Expo tokens cannot be sent through Firebase Admin
  if (isExpoPushToken(pushToken)) {
    try {
      return await sendViaExpo(pushToken, title, body, stringData || {});
    } catch (error) {
      console.error("Error sending Expo push notification:", error);
      return null;
    }
  }

  const message = {
    token: pushToken,
    notification: {
      title,
      body,
    },
    android: {
      priority: "high",
      notification: {
        channelId: ANDROID_CHANNEL_ID,
        sound: ANDROID_SOUND,
        defaultVibrateTimings: true,
        priority: "high",
        visibility: "public",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          alert: {
            title,
            body,
          },
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  if (stringData) {
    message.data = stringData;
  }

  try {
    const response = await admin.messaging().send(message);
    console.log("Push notification sent:", response);
    return response;
  } catch (error) {
    console.error("Error sending push notification:", {
      code: error.code,
      message: error.message,
      tokenPreview:
        typeof pushToken === "string"
          ? `${pushToken.slice(0, 12)}…`
          : undefined,
    });

    if (error.code && INVALID_TOKEN_ERROR_CODES.has(error.code)) {
      await clearInvalidPushToken(pushToken);
    }

    return null;
  }
};

/**
 * Send FCM/Expo when the app user has an `expoPushToken`.
 * @param {{ expoPushToken?: string }} user
 */
const sendPushToAppUser = async (user, title, body, data = {}) => {
  if (!user || !user.expoPushToken) {
    return null;
  }
  return sendPushNotification(user.expoPushToken, title, body, data);
};

module.exports = { sendPushNotification, sendPushToAppUser };
