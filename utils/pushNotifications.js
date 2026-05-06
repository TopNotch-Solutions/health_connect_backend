const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
// optionally providing an access token if you have enabled push security
const expo = new Expo();

const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!pushToken) {
      console.log("No push token provided, skipping notification.");
      return;
  }
  
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  const messages = [];
  messages.push({
    to: pushToken,
    // iOS picks up this sound from the app bundle (healthconnect_alert.wav).
    // Android ignores this field — the channel's sound setting takes over.
    sound: 'healthconnect_alert.wav',
    title: title,
    body: body,
    data: data,
    channelId: 'healthconnect-default', // route to the custom HealthConnect channel on Android
  });

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log("Push notification sent:", ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }
};

module.exports = { sendPushNotification };
