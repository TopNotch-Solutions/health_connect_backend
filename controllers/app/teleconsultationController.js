const ConsultationRequest = require("../../models/request");
const {
  getStreamVideoClient,
  buildTeleconsultationCallId,
} = require("../../utils/streamVideo");

exports.getCallAccess = async (req, res) => {
  const userId = req.user.id;
  const { requestId } = req.params;

  try {
    const request = await ConsultationRequest.findById(requestId)
      .populate("patientId", "fullname profileImage")
      .populate("providerId", "fullname profileImage role");

    if (!request) {
      return res.status(404).json({
        message: "Teleconsultation request not found.",
      });
    }

    if (request.consultationMode !== "video_consultation") {
      return res.status(400).json({
        message: "Call access is only available for video consultations.",
      });
    }

    if (!["ready_for_call", "in_call"].includes(request.status)) {
      return res.status(400).json({
        message: "This teleconsultation is not ready for call access yet.",
      });
    }

    const patientId = request.patientId?._id?.toString();
    const providerId = request.providerId?._id?.toString();
    const currentUserId = userId?.toString();

    const isPatient = patientId === currentUserId;
    const isProvider = providerId === currentUserId;

    if (!isPatient && !isProvider) {
      return res.status(403).json({
        message: "You are not authorized to access this teleconsultation call.",
      });
    }

    if (!patientId || !providerId) {
      return res.status(400).json({
        message: "This teleconsultation is missing patient or provider assignment.",
      });
    }

    const streamClient = getStreamVideoClient();
    const callId = buildTeleconsultationCallId(request._id.toString());
    const callType = "default";

    await streamClient.upsertUsers([
      {
        id: patientId,
        name: request.patientId?.fullname || "Patient",
      },
      {
        id: providerId,
        name: request.providerId?.fullname || "Provider",
      },
    ]);

    await streamClient.video.call(callType, callId).getOrCreate({
      data: {
        created_by_id: providerId,
        members: [{ user_id: patientId }, { user_id: providerId }],
      },
    });

    const token = streamClient.generateUserToken({
      user_id: currentUserId,
      validity_in_seconds: 60 * 60 * 4,
    });

    return res.status(200).json({
      status: true,
      data: {
        apiKey: process.env.STREAM_VIDEO_API_KEY,
        callId,
        callType,
        token,
        requestId: request._id,
        requestStatus: request.status,
      },
    });
  } catch (error) {
    console.error("Error generating teleconsultation call access:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      metadata: error?.metadata,
      response: error?.response,
    });
    return res.status(500).json({
      message:
        "We're having trouble preparing the teleconsultation call. Please try again shortly.",
    });
  }
};

module.exports = {
  getCallAccess: exports.getCallAccess,
};
