require("dotenv").config();
const fetch = require("node-fetch");

async function callExternalApi(param4, param5) {
  try {
    const url = new URL("https://connectsms.mtc.com.na/api.asmx/SendSMS");
    url.searchParams.append("from_number", process.env.SMS_API_SENDERID);
    url.searchParams.append("username", process.env.SMS_API_USERNAME);
    url.searchParams.append("password", process.env.SMS_API_PASSWORD);
    url.searchParams.append("destination", param4);
    url.searchParams.append("message", param5);

    const response = await fetch(url);
    const text = await response.text();
    console.log("SMS API response:", text); // optional for debugging
    return text;
  } catch (error) {
    console.error("Error calling SMS API:", error);
    throw error;
  }
}

module.exports = callExternalApi;