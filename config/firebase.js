const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const serviceAccountPath = path.resolve(
  __dirname,
  "../health-connect-uat-firebase-adminsdk-fbsvc-51241b9223.json",
);

let firebaseEnabled = false;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(serviceAccountPath);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    firebaseEnabled = true;
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.warn(
      "Firebase Admin could not be initialized. Push notifications via Firebase will be disabled.",
    );
    console.warn(error.message);
  }
} else {
  console.warn(
    `Firebase service account file not found at ${serviceAccountPath}. Firebase push notifications will be disabled.`,
  );
}

if (!firebaseEnabled) {
  module.exports = {
    messaging() {
      return {
        async send() {
          console.warn(
            "Skipping Firebase push send because Firebase Admin is not configured.",
          );
          return null;
        },
      };
    },
  };
} else {
  module.exports = admin;
}
