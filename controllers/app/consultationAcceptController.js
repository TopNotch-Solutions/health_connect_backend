const mongoose = require("mongoose");
const User = require("../../models/user");
const ConsultationRequest = require("../../models/request");
const AilmentCategory = require("../../models/ailment");
const PostalAddress = require("../../models/postalAddress");
const Notification = require("../../models/notification");
const { formatPostalAddressString } = require("../../utils/postalAddressValidation");
const { sendPushNotification } = require("../../utils/pushNotifications");
const { getIO } = require("../../utils/socketIo");
const { getUserSockets } = require("../portal/requestController");

const PROVIDER_ACTIVE_STATUSES = [
  "accepted",
  "payment_pending",
  "paid",
  "provider_confirmation_pending",
  "ready_for_call",
  "in_call",
  "en_route",
  "arrived",
  "in_progress",
];

const isValidLatitude = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;

const isValidLongitude = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= -180 &&
  value <= 180;

const normalizeCoordinates = (coordinates) => {
  if (!coordinates) return null;
  const latitude =
    typeof coordinates.latitude === "string"
      ? Number(coordinates.latitude)
      : coordinates.latitude;
  const longitude =
    typeof coordinates.longitude === "string"
      ? Number(coordinates.longitude)
      : coordinates.longitude;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const providerMatchesAilment = (provider, ailmentCategory) => {
  if (!ailmentCategory || !provider) return false;

  if (ailmentCategory.provider) {
    const roleMapping = {
      doctor: "Doctor",
      nurse: "Nurse",
      physiotherapist: "Physiotherapist",
      "social worker": "Social Worker",
      pharmacist: "Pharmacist",
    };
    const expectedProviderType = roleMapping[provider.role?.toLowerCase()];
    if (
      expectedProviderType &&
      ailmentCategory.provider !== expectedProviderType
    ) {
      return false;
    }
    return true;
  }

  if (
    !ailmentCategory.specialization ||
    ailmentCategory.specialization.length === 0
  ) {
    return true;
  }

  if (!provider.specializations || provider.specializations.length === 0) {
    return false;
  }

  const ailmentSpecializationTitles = ailmentCategory.specialization
    .map((spec) =>
      spec && typeof spec === "object" && spec.title ? spec.title : null,
    )
    .filter((title) => title !== null);

  if (ailmentSpecializationTitles.length === 0) return false;

  return provider.specializations.some((providerSpecTitle) =>
    ailmentSpecializationTitles.some(
      (ailmentSpecTitle) =>
        providerSpecTitle === ailmentSpecTitle ||
        providerSpecTitle.toLowerCase() === ailmentSpecTitle.toLowerCase(),
    ),
  );
};

const ensureRequestConsultationCost = async (request) => {
  if (
    typeof request?.consultationCost === "number" &&
    Number.isFinite(request.consultationCost) &&
    request.consultationCost > 0
  ) {
    return true;
  }

  const ailmentCategory =
    request?.ailmentCategoryId &&
    typeof request.ailmentCategoryId === "object" &&
    (request.ailmentCategoryId.teleconsultationCost !== undefined ||
      request.ailmentCategoryId.physicalconsultationCost !== undefined)
      ? request.ailmentCategoryId
      : await AilmentCategory.findById(request.ailmentCategoryId);

  if (!ailmentCategory) return false;

  const selectedCost =
    request.consultationMode === "video_consultation"
      ? ailmentCategory.teleconsultationCost
      : ailmentCategory.physicalconsultationCost;
  const parsedCost = parseFloat(selectedCost);
  if (isNaN(parsedCost) || parsedCost <= 0) return false;

  request.consultationCost = parsedCost;
  return true;
};

/**
 * Shared accept flow for HTTP + socket callers.
 * @returns {{ ok: true, request, nextStatus } | { ok: false, status: number, error: string }}
 */
async function acceptConsultationRequest({
  requestId,
  providerId,
  providerLocation,
}) {
  if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
    return { ok: false, status: 400, error: "Invalid consultation request id." };
  }
  if (!providerId || !mongoose.Types.ObjectId.isValid(providerId)) {
    return {
      ok: false,
      status: 401,
      error: "Authentication required. Please sign in again.",
    };
  }

  const request = await ConsultationRequest.findById(requestId);
  if (!request) {
    return {
      ok: false,
      status: 404,
      error:
        "We couldn't find this consultation request. It may have been cancelled or already completed. Please refresh and try again.",
    };
  }

  if (request.status !== "searching" && request.status !== "pending") {
    return {
      ok: false,
      status: 409,
      error:
        "This consultation request is no longer available for acceptance. It may have been accepted by another provider or cancelled.",
    };
  }

  const validProviderId = new mongoose.Types.ObjectId(providerId);
  const provider = await User.findById(validProviderId);
  if (!provider) {
    return {
      ok: false,
      status: 404,
      error:
        "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
    };
  }

  const activeForProvider = await ConsultationRequest.findOne({
    providerId: validProviderId,
    status: { $in: PROVIDER_ACTIVE_STATUSES },
  }).select("_id status");
  if (activeForProvider) {
    return {
      ok: false,
      status: 409,
      error:
        "You already have an ongoing consultation. Please complete or cancel it before accepting another request.",
    };
  }

  const acceptProviderCoordinates = normalizeCoordinates(providerLocation);
  if (!acceptProviderCoordinates) {
    return {
      ok: false,
      status: 400,
      error:
        "Your current location is required before accepting this consultation. Please refresh nearby requests and try again.",
    };
  }

  await request.populate({
    path: "ailmentCategoryId",
    populate: {
      path: "specialization",
      select: "title",
    },
  });

  if (!providerMatchesAilment(provider, request.ailmentCategoryId)) {
    return {
      ok: false,
      status: 403,
      error:
        "This consultation is not available for your provider type or specialization.",
    };
  }

  if (!provider.isDocumentVerified) {
    return {
      ok: false,
      status: 403,
      error:
        "Your account is pending verification. The admin must first approve your application before you can accept consultation requests.",
    };
  }

  if (Number(provider.consultations || 0) <= 0) {
    return {
      ok: false,
      status: 403,
      error:
        "You have no remaining consultation credits. Please select and purchase a package to continue accepting consultation requests.",
    };
  }

  if (request.paymentMethod === "medical_aid") {
    const providerPostal = await PostalAddress.findOne({
      userId: validProviderId,
    });
    if (!providerPostal) {
      return {
        ok: false,
        status: 400,
        error:
          "Please confirm your Namibian postal address before accepting a medical aid consultation.",
      };
    }
    request.providerPostalAddress = {
      addressee: providerPostal.addressee,
      addressType: providerPostal.addressType,
      boxNumber: providerPostal.boxNumber || undefined,
      bagNumber: providerPostal.bagNumber || undefined,
      unitOrAdditional: providerPostal.unitOrAdditional || undefined,
      premises: providerPostal.premises || undefined,
      subLocality: providerPostal.subLocality || undefined,
      locality: providerPostal.locality || undefined,
      postOffice: providerPostal.postOffice,
      postcode: providerPostal.postcode,
      country: providerPostal.country || "NAMIBIA",
      formatted: formatPostalAddressString(providerPostal),
    };
  }

  const isVideo = request.consultationMode === "video_consultation";
  const isCashPayment = request.paymentMethod === "cash";
  const nextStatus = isVideo
    ? isCashPayment
      ? "payment_pending"
      : "ready_for_call"
    : "accepted";

  request.status = nextStatus;
  request.providerId = validProviderId;
  if (nextStatus === "payment_pending") {
    request.paymentStatus = "pending";
  } else if (isVideo && !isCashPayment) {
    request.paymentStatus = "paid";
  }

  if (!(await ensureRequestConsultationCost(request))) {
    return {
      ok: false,
      status: 400,
      error:
        "Consultation cost for this request is unavailable. Please contact support.",
    };
  }

  await request.save();

  await request.populate("patientId", "fullname cellphoneNumber");
  await request.populate(
    "providerId",
    "fullname cellphoneNumber role profileImage bio",
  );
  await request.populate("ailmentCategoryId");

  // Realtime fan-out (best effort)
  try {
    const io = getIO();
    const sockets = getUserSockets();
    const providerKey = request.providerId?._id?.toString();
    const patientKey = request.patientId?._id?.toString();

    if (io && providerKey && sockets?.get(providerKey)) {
      io.to(sockets.get(providerKey)).emit("acceptConfirmed", {
        requestId: request._id.toString(),
      });
      io.to(sockets.get(providerKey)).emit("requestUpdated", request);
    }
    if (io && patientKey && sockets?.get(patientKey)) {
      io.to(sockets.get(patientKey)).emit("requestUpdated", request);
    }
    if (io) {
      io.emit("requestStatusChanged", {
        requestId: request._id.toString(),
        status: nextStatus,
      });
    }
  } catch (emitErr) {
    console.warn("acceptConsultationRequest realtime emit failed:", emitErr);
  }

  // Push + persistent notification
  try {
    const patientUser = await User.findById(request.patientId._id);
    if (patientUser) {
      await Notification.createNotification({
        userId: patientUser._id,
        type:
          nextStatus === "payment_pending"
            ? "consultation_payment_pending"
            : "consultation_accepted",
        title:
          nextStatus === "payment_pending"
            ? "Payment Required"
            : "Request Accepted",
        message:
          nextStatus === "payment_pending"
            ? `${request.providerId.fullname} accepted your teleconsultation. Complete payment to continue.`
            : `${request.providerId.fullname} has accepted your request.`,
        status: "sent",
        data: { requestId: request._id },
      });

      if (patientUser.expoPushToken) {
        sendPushNotification(
          patientUser.expoPushToken,
          nextStatus === "payment_pending"
            ? "Payment Required"
            : "Request Accepted",
          nextStatus === "payment_pending"
            ? `${request.providerId.fullname} accepted your teleconsultation. Complete payment to continue.`
            : `${request.providerId.fullname} has accepted your request.`,
          {
            type:
              nextStatus === "payment_pending"
                ? "consultation_payment_pending"
                : "consultation_accepted",
            requestId: request._id,
          },
        );
      }
    }
  } catch (notifyErr) {
    console.warn("acceptConsultationRequest notify failed:", notifyErr);
  }

  return { ok: true, request, nextStatus };
}

async function acceptRequestHttp(req, res) {
  try {
    const providerId = req.user?.id;
    const requestId = req.params.id;
    const providerLocation =
      req.body?.providerLocation || req.body?.location || null;

    console.log("🔔 HTTP acceptRequest", {
      requestId,
      providerId,
      hasLocation: Boolean(providerLocation),
    });

    const result = await acceptConsultationRequest({
      requestId,
      providerId,
      providerLocation,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        status: "FAILURE",
        message: result.error,
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      message: "Request accepted.",
      request: result.request,
      nextStatus: result.nextStatus,
    });
  } catch (err) {
    console.error("❌ HTTP acceptRequest error:", err);
    return res.status(500).json({
      status: "ERROR",
      message: err.message || "Failed to accept request",
    });
  }
}

module.exports = {
  acceptConsultationRequest,
  acceptRequestHttp,
};
