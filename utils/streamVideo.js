const { StreamClient } = require("@stream-io/node-sdk");

let streamClientInstance = null;

const getStreamVideoClient = () => {
  const apiKey = process.env.STREAM_VIDEO_API_KEY;
  const secret = process.env.STREAM_VIDEO_SECRET;

  if (!apiKey || !secret) {
    throw new Error(
      "Stream Video credentials are missing. Please set STREAM_VIDEO_API_KEY and STREAM_VIDEO_SECRET.",
    );
  }

  if (!streamClientInstance) {
    streamClientInstance = new StreamClient(apiKey, secret);
  }

  return streamClientInstance;
};

const buildTeleconsultationCallId = (requestId) =>
  `teleconsultation-${requestId}`;

module.exports = {
  getStreamVideoClient,
  buildTeleconsultationCallId,
};
