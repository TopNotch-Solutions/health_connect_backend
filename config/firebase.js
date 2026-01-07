const admin = require("firebase-admin");
const serviceAccount = require("../health-connect-uat-firebase-adminsdk-fbsvc-51241b9223.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;