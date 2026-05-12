const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");
const schedule = require("node-schedule");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
});

const authRouter = require("./routes/common/authRoute");
const authAppRouter = require("./routes/app/authRoute");
const issueAppRouter = require("./routes/app/issueRoute");
const notificationAppRouter = require("./routes/app/notificationRouter");
const teleconsultationAppRouter = require("./routes/app/teleconsultationRoute");
const transactionAppRouter = require("./routes/app/transactionRoute");
const specializationAppRouter = require("./routes/app/specializationRoute");
const specializationPortalRouter = require("./routes/portal/specializationRoute");
const aligmentPortalRouter = require("./routes/portal/aligmentRoute");
const faqPortalRouter = require("./routes/portal/faqRoute");
const faqAppRouter = require("./routes/app/faqRoute");
const notificationPortalRouter = require("./routes/portal/notificationRoute");
const advertsRouter = require("./routes/portal/advertsRoutes");
const appAdvertRouter = require("./routes/app/advertsRoutes");
const packagesAppRouter = require("./routes/app/packagesRoutes");

const authPortalRouter = require("./routes/portal/authController");
const requestPortalRouter = require("./routes/portal/requestRoute");
const packagesPortalRouter = require("./routes/portal/packagesRoute");
const prescriptionAppRouter = require("./routes/app/prescriptionRoute");
const { setSocketData } = require("./controllers/portal/requestController");
const User = require("./models/user");
const ConsultationRequest = require("./models/request");
const AilmentCategory = require("./models/ailment");
const Transaction = require("./models/transaction");
const Notification = require("./models/notification");
const { sendPushNotification } = require("./utils/pushNotifications");

app.use(express.static("public"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: [
      process.env.LOCAL_HOST_1,
      process.env.LOCAL_HOST_2,
      process.env.LOCAL_HOST_3,
    ],
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    credentials: true,
  }),
);

app.use("/api/auth", authRouter);
app.use("/api/app/auth", authAppRouter);
app.use("/api/app/issue", issueAppRouter);
app.use("/api/app/notification", notificationAppRouter);
app.use("/api/app/teleconsultation", teleconsultationAppRouter);
app.use("/api/app/transaction", transactionAppRouter);
app.use("/api/app/specialization", specializationAppRouter);
app.use("/api/portal/specialization", specializationPortalRouter);
app.use("/api/portal/aligment", aligmentPortalRouter);
app.use("/api/portal/faq", faqPortalRouter);
app.use("/api/app/faq", faqAppRouter);
app.use("/api/portal/notification", notificationPortalRouter);
app.use("/api/app/adverts", appAdvertRouter);
app.use("/api/app/packages", packagesAppRouter);
app.use("/api/app/prescription", prescriptionAppRouter);

// Provider request history — returns ALL requests for the authenticated provider (incl. completed)
const { tokenAuthMiddleware, checkUser } = require("./middlewares/authMiddleware");
app.get("/api/app/requests/my-history", tokenAuthMiddleware, checkUser, async (req, res) => {
  try {
    const providerId = req.user.id;
    const requests = await ConsultationRequest.find({ providerId })
      .populate("patientId", "fullname cellphoneNumber profileImage")
      .populate("ailmentCategoryId", "title provider requiresPrescription")
      .sort({ createdAt: -1 });
    return res.status(200).json({ requests });
  } catch (err) {
    console.error("my-history error:", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
});

app.use("/api/portal/auth", authPortalRouter);
app.use("/api/portal/request", requestPortalRouter);
app.use("/api/portal/adverts", advertsRouter);
app.use("/api/portal/packages", packagesPortalRouter);

const onlineUsers = {
  patient: new Set(),
  doctor: new Set(),
  nurse: new Set(),
  physiotherapist: new Set(),
  "social worker": new Set(),
  pharmacist: new Set(),
};

// Store socket IDs by user role and userId for targeted messaging
const userSockets = new Map(); // userId -> socketId

// Expose socket data to request controller
setSocketData(
  () => onlineUsers,
  () => userSockets,
);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle user joining with a role
  // Helper function to check if a provider matches an ailment category based on specializations
  const providerMatchesAilment = (provider, ailmentCategory) => {
    if (!ailmentCategory || !provider) {
      return false;
    }

    // Provider type is the primary routing rule. Specializations are used only
    // as a fallback for older categories that do not have a provider type set.
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

    // Check if provider has any specializations that match the ailment category's specializations
    if (
      !ailmentCategory.specialization ||
      ailmentCategory.specialization.length === 0
    ) {
      // If ailment has no specializations, allow all providers of matching role
      return true;
    }

    if (!provider.specializations || provider.specializations.length === 0) {
      // Provider has no specializations, don't match
      return false;
    }

    // Extract specialization titles from ailment category
    // If populated, specialization is an array of Specialization documents with title field
    // If not populated, specialization is an array of ObjectIds
    const ailmentSpecializationTitles = ailmentCategory.specialization
      .map((spec) => {
        // If populated (has title property), use the title
        if (spec && typeof spec === "object" && spec.title) {
          return spec.title;
        }
        // If not populated (ObjectId), we can't match by title, return null
        return null;
      })
      .filter((title) => title !== null);

    // If we couldn't extract any titles (not populated), return false
    if (ailmentSpecializationTitles.length === 0) {
      return false;
    }

    // Check if provider has any matching specialization title
    // provider.specializations is an array of strings (titles)
    const hasMatchingSpecialization = provider.specializations.some(
      (providerSpecTitle) => {
        return ailmentSpecializationTitles.some(
          (ailmentSpecTitle) =>
            providerSpecTitle === ailmentSpecTitle ||
            providerSpecTitle.toLowerCase() === ailmentSpecTitle.toLowerCase(),
        );
      },
    );

    return hasMatchingSpecialization;
  };

  const PROVIDER_ROLES = [
    "doctor",
    "nurse",
    "physiotherapist",
    "social worker",
    "pharmacist",
  ];
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
  const SEARCH_RADIUS_MAX_KM = 8;
  const SEARCH_RADIUS_STEP_MINUTES = 1;
  const SEARCH_EXPIRE_HOURS = 6;

  const isValidLatitude = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;

  const isValidLongitude = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180;

  const getDistanceInKm = (
    startLatitude,
    startLongitude,
    endLatitude,
    endLongitude,
  ) => {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latitudeDelta = toRadians(endLatitude - startLatitude);
    const longitudeDelta = toRadians(endLongitude - startLongitude);
    const a =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.cos(toRadians(startLatitude)) *
        Math.cos(toRadians(endLatitude)) *
        Math.sin(longitudeDelta / 2) *
        Math.sin(longitudeDelta / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  };

  const getPatientCoordinatesFromRequest = (request) => {
    const geoJsonCoordinates = request?.address?.coordinates?.coordinates;
    if (
      Array.isArray(geoJsonCoordinates) &&
      geoJsonCoordinates.length >= 2 &&
      typeof geoJsonCoordinates[0] === "number" &&
      typeof geoJsonCoordinates[1] === "number"
    ) {
      return {
        longitude: geoJsonCoordinates[0],
        latitude: geoJsonCoordinates[1],
      };
    }

    const trackedPatientLocation = request?.locationTracking?.patientLocation;
    if (
      trackedPatientLocation &&
      typeof trackedPatientLocation.longitude === "number" &&
      typeof trackedPatientLocation.latitude === "number"
    ) {
      return {
        longitude: trackedPatientLocation.longitude,
        latitude: trackedPatientLocation.latitude,
      };
    }

    return null;
  };

  const getAllowedSearchRadiusKm = (createdAt) => {
    const createdAtTime = new Date(createdAt).getTime();
    if (!Number.isFinite(createdAtTime)) {
      return null;
    }

    const hoursElapsed = (Date.now() - createdAtTime) / (1000 * 60 * 60);
    if (hoursElapsed >= SEARCH_EXPIRE_HOURS) {
      return null;
    }

    const minutesElapsed = hoursElapsed * 60;
    const steppedRadius =
      Math.floor(minutesElapsed / SEARCH_RADIUS_STEP_MINUTES) + 1;
    return Math.min(SEARCH_RADIUS_MAX_KM, steppedRadius);
  };

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

  const providerCanSeeRequest = (provider, request, providerCoordinates) => {
    const ailmentCategory = request?.ailmentCategoryId;
    if (!providerMatchesAilment(provider, ailmentCategory)) {
      return {
        allowed: false,
        reason: "provider_role_or_specialization_mismatch",
      };
    }

    const normalizedProviderCoordinates =
      normalizeCoordinates(providerCoordinates);
    if (!normalizedProviderCoordinates) {
      return { allowed: false, reason: "provider_location_missing" };
    }

    const allowedRadiusKm = getAllowedSearchRadiusKm(request.createdAt);
    if (!allowedRadiusKm) {
      return { allowed: false, reason: "request_search_window_expired" };
    }

    const patientCoordinates = getPatientCoordinatesFromRequest(request);
    if (
      !patientCoordinates ||
      !isValidLatitude(patientCoordinates.latitude) ||
      !isValidLongitude(patientCoordinates.longitude)
    ) {
      return { allowed: false, reason: "patient_location_missing" };
    }

    const distanceInKm = getDistanceInKm(
      normalizedProviderCoordinates.latitude,
      normalizedProviderCoordinates.longitude,
      patientCoordinates.latitude,
      patientCoordinates.longitude,
    );

    return {
      allowed: distanceInKm <= allowedRadiusKm,
      reason:
        distanceInKm <= allowedRadiusKm
          ? "allowed"
          : "provider_outside_search_radius",
      distanceInKm,
      allowedRadiusKm,
    };
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

    if (!ailmentCategory) {
      return false;
    }

    const selectedCost =
      request.consultationMode === "video_consultation"
        ? ailmentCategory.teleconsultationCost
        : ailmentCategory.physicalconsultationCost;
    const parsedCost = parseFloat(selectedCost);

    if (isNaN(parsedCost) || parsedCost <= 0) {
      return false;
    }

    request.consultationCost = parsedCost;
    return true;
  };

  socket.on("join", (data) => {
    const { role, userId } = data;

    if (role && onlineUsers[role]) {
      onlineUsers[role].add(socket.id);
      socket.role = role;
      socket.userId = userId;

      // Store socket for user if userId provided
      if (userId) {
        userSockets.set(userId, socket.id);
      }

      // Calculate total online users
      const totalOnline = Object.values(onlineUsers).reduce(
        (sum, users) => sum + users.size,
        0,
      );

      // Emit updated online users count to all clients
      io.emit("onlineUsersUpdate", {
        byRole: {
          patient: onlineUsers.patient.size,
          doctor: onlineUsers.doctor.size,
          nurse: onlineUsers.nurse.size,
          physiotherapist: onlineUsers.physiotherapist.size,
          "social worker": onlineUsers["social worker"].size,
          pharmacist: onlineUsers.pharmacist.size,
        },
        total: totalOnline,
      });

      console.log(
        `User ${socket.id} joined as ${role}. Total online: ${totalOnline}`,
      );
    }
  });

  // Create a new consultation request (Patient)
  socket.on("createRequest", async (data) => {
    try {
      const {
        patientId,
        ailmentCategoryId,
        address,
        paymentMethod,
        consultationMode,
      } = data;

      console.log(data);
      // Active statuses where a patient is considered to have an ongoing request
      const activePatientStatuses = [
        "searching",
        "pending",
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

      // Convert patientId to ObjectId (patientId is always a valid ObjectId)
      const validPatientId = new mongoose.Types.ObjectId(patientId);

      // Verify patient's document is verified before allowing consultation request
      const patient = await User.findById(validPatientId);
      if (!patient) {
        socket.emit("requestError", {
          error:
            "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
        });
        return;
      }

      if (!patient.isDocumentVerified) {
        socket.emit("requestError", {
          error:
            "Your account is pending verification. Please wait for our admin team to verify your information before requesting a consultation. We'll notify you once your account has been verified. If verification is taking too long, you can log a ticket in the issues section.",
        });
        return;
      }

      // Enforce single active request per patient
      const existingActive = await ConsultationRequest.findOne({
        patientId: validPatientId,
        status: { $in: activePatientStatuses },
      }).sort({ createdAt: -1 });

      if (existingActive) {
        await existingActive.populate(
          "patientId",
          "fullname cellphoneNumber",
        );
        await existingActive.populate("ailmentCategoryId");

        socket.emit("requestError", {
          error:
            "You already have an active consultation request. Please complete or cancel it before creating a new one.",
          existingRequestId: existingActive._id,
        });
        return;
      }

      const ailmentCategory = await AilmentCategory.findById(ailmentCategoryId);
      if (!ailmentCategory) {
        socket.emit("requestError", {
          error:
            "We couldn't find this consultation category. Please refresh and try again.",
        });
        return;
      }

      if (
        consultationMode === "video_consultation" &&
        !ailmentCategory.supportsTeleconsultation
      ) {
        socket.emit("requestError", {
          error:
            "This ailment category does not support video consultation. Please choose physical consultation.",
        });
        return;
      }

      const selectedCost =
        consultationMode === "video_consultation"
          ? ailmentCategory.teleconsultationCost
          : ailmentCategory.physicalconsultationCost;
      const parsedEstimatedCost = parseFloat(selectedCost);
      if (isNaN(parsedEstimatedCost) || parsedEstimatedCost <= 0) {
        socket.emit("requestError", {
          error:
            "Consultation cost for this category is unavailable. Please contact support.",
        });
        return;
      }


      const request = new ConsultationRequest({
        patientId: validPatientId,
        ailmentCategoryId,
        address,
        preferredTime: Date.now(),
        consultationCost: parsedEstimatedCost,
        paymentMethod: paymentMethod,
        status: "searching",
        consultationMode,
      });

      await request.save();
      await request.populate(
        "patientId",
        "fullname cellphoneNumber profileImage",
      );
      await request.populate({
        path: "ailmentCategoryId",
        populate: {
          path: "specialization",
          select: "title",
        },
      });

      // Notify patient using their user id
      const patientSocketId = userSockets.get(patientId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestCreated", request);
      }

      // Notify all providers about new available request
      // Only notify providers that are not currently busy and match the ailment specialization
      const populatedAilmentCategory = request.ailmentCategoryId;

      for (const [socketUserId, socketId] of userSockets.entries()) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (
          !targetSocket ||
          !targetSocket.role ||
          targetSocket.role === "patient"
        )
          continue;

        // Find provider by _id to determine busy status
        let provider = null;
        if (mongoose.Types.ObjectId.isValid(socketUserId)) {
          provider = await User.findById(socketUserId);
        }
        if (!provider) {
          provider = null;
        }

        const visibilityCheck = providerCanSeeRequest(
          provider,
          request,
          targetSocket.providerLocation,
        );
        if (!visibilityCheck.allowed) {
          console.log("Skipping realtime request push:", {
            providerId: socketUserId,
            requestId: request._id,
            reason: visibilityCheck.reason,
            distanceInKm: visibilityCheck.distanceInKm,
            allowedRadiusKm: visibilityCheck.allowedRadiusKm,
            ailmentProvider: populatedAilmentCategory?.provider,
          });
          continue;
        }

        let providerObjectId = provider ? provider._id : null;

        // If provider record not found yet (e.g., first time), treat as not busy
        let isBusy = false;
        if (providerObjectId) {
          const activeForProvider = await ConsultationRequest.findOne({
            providerId: providerObjectId,
            status: { $in: PROVIDER_ACTIVE_STATUSES },
          }).select("_id");
          isBusy = Boolean(activeForProvider);
        }

        if (!isBusy) {
          io.to(socketId).emit("newRequestAvailable", request);

          // Send push notification
          const providerUser = provider;
          if (providerUser) {
            // Create persistent notification
            try {
              await Notification.createNotification({
                userId: providerUser._id,
                type: "consultation_requested",
                title: "New Consultation Request",
                message: "A new patient is requesting a consultation nearby.",
                status: "sent",
                data: { requestId: request._id },
              });
            } catch (err) {
              console.error("Error creating notification:", err);
            }

            if (
              providerUser.expoPushToken &&
              providerUser.isPushNotificationEnabled
            ) {
              sendPushNotification(
                providerUser.expoPushToken,
                "New Consultation Request",
                "A new patient is requesting a consultation nearby.",
                { requestId: request._id },
              );
            }
          }
        }
      }
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get requests for patient
  socket.on("getPatientRequests", async (data) => {
    try {
      const { patientId } = data;

      // Convert patientId to ObjectId (patientId is always a valid ObjectId)
      const validPatientId = new mongoose.Types.ObjectId(patientId);

      const requests = await ConsultationRequest.find({
        patientId: validPatientId,
      })
        .populate("patientId", "fullname cellphoneNumber")
        .populate("providerId", "fullname cellphoneNumber role")
        .populate("ailmentCategoryId")
        .sort({ createdAt: -1 });

      socket.emit("patientRequests", requests);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get available requests for providers
  socket.on("getAvailableRequests", async (data = {}) => {
    try {
      const { providerId, providerLocation, latitude, longitude } = data;
      console.log("🔍 getAvailableRequests handler - providerId:", providerId);

      const providerLatitude = providerLocation?.latitude ?? latitude;
      const providerLongitude = providerLocation?.longitude ?? longitude;
      const parsedProviderCoordinates = {
        latitude:
          typeof providerLatitude === "string"
            ? Number(providerLatitude)
            : providerLatitude,
        longitude:
          typeof providerLongitude === "string"
            ? Number(providerLongitude)
            : providerLongitude,
      };

      if (
        !isValidLatitude(parsedProviderCoordinates.latitude) ||
        !isValidLongitude(parsedProviderCoordinates.longitude)
      ) {
        socket.emit("requestError", {
          error:
            "Provider location (valid latitude and longitude) is required to retrieve consultations.",
        });
        return;
      }
      socket.providerLocation = parsedProviderCoordinates;

      // Get provider details to check specializations
      // Try to get providerId from data first, then fallback to socket.userId
      const identifier = providerId || socket.userId;
      let provider = null;
      let validProviderId = null;

      if (!identifier) {
        socket.emit("requestError", {
          error:
            "Provider identification is required to get available requests.",
        });
        return;
      }

      // Get provider by identifier (_id only)
      if (!mongoose.Types.ObjectId.isValid(identifier)) {
        provider = null;
        if (provider) {
          validProviderId = provider._id; // Use ObjectId directly for queries
        } else {
          socket.emit("requestError", {
            error:
              "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
          });
          return;
        }
      } else {
        validProviderId = new mongoose.Types.ObjectId(identifier);
        provider = await User.findById(validProviderId);
        if (!provider) {
          socket.emit("requestError", {
            error:
              "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
          });
          return;
        }
      }

      console.log("🔍 Converted providerId to:", validProviderId);

      // Busy if any active consultation
      if (validProviderId) {
        const activeForProvider = await ConsultationRequest.findOne({
          providerId: validProviderId,
          status: { $in: PROVIDER_ACTIVE_STATUSES },
        }).select("_id");
        if (activeForProvider) {
          console.log(
            "⚠️ Provider is busy with request:",
            activeForProvider._id,
          );
          socket.emit("availableRequests", []);
          return;
        }
      }

      // Simplified query: Just show requests with status "searching"
      // Providers will see requests that haven't been claimed yet
      const availabilityFilter = { status: "searching" };

      console.log(
        "🔍 Executing query with simplified filter:",
        JSON.stringify(availabilityFilter, null, 2),
      );
      const requests = await ConsultationRequest.find(availabilityFilter)
        .populate("patientId", "fullname cellphoneNumber")
        .populate({
          path: "ailmentCategoryId",
          populate: {
            path: "specialization",
            select: "title",
          },
        })
        .sort({ createdAt: -1 });

      // Always filter requests based on provider specialization and dynamic distance window
      const filteredRequests = requests.filter((request) => {
        const visibilityCheck = providerCanSeeRequest(
          provider,
          request,
          parsedProviderCoordinates,
        );
        if (!visibilityCheck.allowed) {
          const ailmentCategory = request.ailmentCategoryId;
          console.log("🚫 Request hidden from provider:", {
            requestId: request._id?.toString(),
            providerId: validProviderId?.toString(),
            providerRole: provider?.role,
            providerSpecializations: provider?.specializations,
            ailmentProvider: ailmentCategory?.provider,
            ailmentSpecializations: ailmentCategory?.specialization?.map(
              (specialization) => specialization?.title || specialization,
            ),
            reason: visibilityCheck.reason,
            distanceInKm: visibilityCheck.distanceInKm,
            allowedRadiusKm: visibilityCheck.allowedRadiusKm,
            providerCoordinates: parsedProviderCoordinates,
            patientCoordinates: getPatientCoordinatesFromRequest(request),
          });
        }
        return visibilityCheck.allowed;
      });
      console.log(
        `✅ Filtered requests from ${requests.length} to ${filteredRequests.length} using specialization and dynamic radius (1km/${SEARCH_RADIUS_STEP_MINUTES}min up to ${SEARCH_RADIUS_MAX_KM}km)`,
      );

      console.log("✅ Found requests count:", filteredRequests.length);
      console.log(
        "✅ Requests IDs:",
        filteredRequests.map((r) => r._id),
      );
      if (filteredRequests.length > 0) {
        console.log(
          "✅ First request:",
          JSON.stringify(filteredRequests[0], null, 2),
        );
      }
      socket.emit("availableRequests", filteredRequests);
    } catch (error) {
      console.error("❌ getAvailableRequests error:", error);
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get ailment categories via socket
  socket.on("getAilmentCategories", async () => {
    try {
      const categories = await AilmentCategory.find()
        .populate("specialization")
        .sort({ createdAt: -1 });
      socket.emit("ailmentCategories", categories);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Update provider response with estimated arrival
  socket.on("updateProviderResponse", async (data) => {
    try {
      const { requestId, estimatedArrival, providerLocation } = data;

      if (!requestId) {
        socket.emit("requestError", { error: "Request ID is required" });
        return;
      }

      if (!estimatedArrival) {
        socket.emit("requestError", { error: "Estimated arrival is required" });
        return;
      }

      if (
        !providerLocation ||
        !providerLocation.latitude ||
        !providerLocation.longitude
      ) {
        socket.emit("requestError", {
          error: "Provider location (latitude and longitude) is required",
        });
        return;
      }

      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", {
          error:
            "We couldn't find this consultation request. It may have been cancelled or already completed. Please refresh and try again.",
        });
        return;
      }

      // Update providerResponse
      request.providerResponse = {
        responseTime: new Date(),
        estimatedArrival: estimatedArrival,
      };

      // Initialize locationTracking if it doesn't exist
      if (!request.locationTracking) {
        request.locationTracking = {};
      }

      // Update provider location
      request.locationTracking.providerLocation = {
        latitude: providerLocation.latitude,
        longitude: providerLocation.longitude,
        lastUpdated: new Date(),
      };

      // Mark locationTracking as modified to ensure it's saved
      request.markModified("locationTracking");

      if (!(await ensureRequestConsultationCost(request))) {
        socket.emit("requestError", {
          error:
            "Consultation cost for this request is unavailable. Please contact support.",
        });
        return;
      }

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role",
      );
      await request.populate({
        path: "ailmentCategoryId",
        populate: {
          path: "specialization",
          select: "title",
        },
      });

      // Notify patient
      const patientIdKey = request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientIdKey);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider
      socket.emit("requestUpdated", request);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get requests for provider
  socket.on("getProviderRequests", async (data) => {
    try {
      const { providerId } = data;
      console.log("🔍 getProviderRequests handler - providerId:", providerId);

      // Find the actual user ObjectId if providerId is not a valid ObjectId
      let validProviderId = providerId;
      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        const user = mongoose.Types.ObjectId.isValid(providerId)
          ? await User.findById(providerId)
          : null;
        if (user) {
          validProviderId = user._id; // Use ObjectId directly for queries
          console.log("🔍 Converted providerId to ObjectId:", validProviderId);
        } else {
          console.log("⚠️ Provider not found in DB with providerId:", providerId);
          socket.emit("providerRequests", []);
          return;
        }
      } else {
        validProviderId = new mongoose.Types.ObjectId(providerId);
        console.log("🔍 Converted string ObjectId to:", validProviderId);
      }

      const requests = await ConsultationRequest.find({
        providerId: validProviderId,
      })
        .populate("patientId", "fullname cellphoneNumber")
        .populate("providerId", "fullname cellphoneNumber role")
        .populate("ailmentCategoryId")
        .sort({ createdAt: -1 });

      console.log("✅ Found provider requests count:", requests.length);
      console.log(
        "✅ Provider requests IDs:",
        requests.map((r) => r._id),
      );
      if (requests.length > 0) {
        console.log(
          "✅ First provider request:",
          JSON.stringify(requests[0], null, 2),
        );
      }

      socket.emit("providerRequests", requests);
    } catch (error) {
      console.error("❌ getProviderRequests error:", error);
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get provider's current location for a specific request
  socket.on("getProviderLocation", async (data, callback) => {
    try {
      const { requestId } = data;

      if (!requestId) {
        if (callback) callback(null);
        return;
      }

      // Convert string ID to ObjectId
      let objectId;
      try {
        objectId = new mongoose.Types.ObjectId(requestId);
      } catch (err) {
        console.error("❌ Invalid ObjectId format:", requestId);
        if (callback) callback(null);
        return;
      }

      const request = await ConsultationRequest.findById(objectId);

      if (!request) {
        console.log("❌ Request not found for getProviderLocation:", requestId);
        if (callback) callback(null);
        return;
      }

      console.log("📍 Request location tracking:", request.locationTracking);
      console.log("📍 Request status:", request.status);

      // Return provider location if available
      if (
        request.locationTracking &&
        request.locationTracking.providerLocation
      ) {
        console.log(
          "✅ Sending provider location from tracking:",
          request.locationTracking.providerLocation,
        );
        if (callback) callback(request.locationTracking.providerLocation);
      } else {
        console.log(
          "⚠️ No location tracking data for request - provider may not have started route yet",
        );
        if (callback) callback(null);
      }
    } catch (error) {
      console.error("❌ getProviderLocation error:", error);
      if (callback) callback(null);
    }
  });

  // Update provider location in real-time for a specific request
  socket.on("updateProviderLocationRealtime", async (data) => {
    try {
      console.log("🔔 Received updateProviderLocationRealtime event");
      console.log("📊 Event data:", JSON.stringify(data));

      const { requestId, location } = data;
      console.log("📊 requestId:", requestId, "location:", location);

      if (!requestId || !location) {
        console.log(
          "⚠️ Missing requestId or location in updateProviderLocationRealtime",
        );
        console.log(
          "📊 requestId truthy:",
          !!requestId,
          "location truthy:",
          !!location,
        );
        return;
      }

      // Convert string ID to ObjectId
      let objectId;
      try {
        objectId = new mongoose.Types.ObjectId(requestId);
        console.log("✅ Converted to ObjectId:", objectId);
      } catch (err) {
        console.error("❌ Invalid ObjectId format:", requestId);
        return;
      }

      const request = await ConsultationRequest.findById(objectId);
      console.log("📊 Request found:", !!request);

      if (!request) {
        console.log(
          "❌ Request not found for updateProviderLocationRealtime:",
          requestId,
        );
        return;
      }

      console.log("📍 Updating location for request:", requestId);

      // Broadcast location update to patient IMMEDIATELY (Real-time)
      const patientIdKey = request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientIdKey);

      if (patientSocketId) {
        // console.log('📍 Broadcasting provider location to patient:', { requestId, location });
        io.to(patientSocketId).emit("updateProviderLocation", {
          requestId,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: new Date(),
          },
        });
      }

      // Update provider location in database (Async - don't wait for it)
      // We only save to DB to persist the last known location for page reloads
      if (!request.locationTracking) {
        request.locationTracking = {};
      }

      request.locationTracking.providerLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        lastUpdated: new Date(),
      };

      request.markModified("locationTracking");
      request
        .save()
        .catch((err) => console.error("Background DB save error:", err));
      // console.log('✅ Location saved to database (background)');
    } catch (error) {
      console.error("❌ updateProviderLocationRealtime error:", error);
      console.error("❌ Error stack:", error.stack);
    }
  });

  // Provider accepts a request
  socket.on("acceptRequest", async (data) => {
    try {
      console.log("🔔 acceptRequest handler - received data:", {
        requestId: data.requestId,
        providerId: data.providerId,
      });
      const { requestId, providerId, providerLocation } = data;

      console.log("🔍 Looking up request with ID:", requestId);
      const request = await ConsultationRequest.findById(requestId);
      console.log("📊 Request found:", !!request, "Status:", request?.status);

      if (!request) {
        socket.emit("requestError", {
          error:
            "We couldn't find this consultation request. It may have been cancelled or already completed. Please refresh and try again.",
        });
        return;
      }

      if (request.status !== "searching" && request.status !== "pending") {
        socket.emit("requestError", {
          error:
            "This consultation request is no longer available for acceptance. It may have been accepted by another provider or cancelled.",
        });
        return;
      }

      // Find provider user - providerId is always valid
      let validProviderId = providerId;
      let provider = null;
      console.log(
        "🔍 Provider ID:",
        providerId,
        "isValid ObjectId:",
        mongoose.Types.ObjectId.isValid(providerId),
      );

      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        console.log(
          "🔍 Provider ID is not ObjectId",
        );
        provider = null;
        console.log("📊 Provider found by id:", !!provider);
        if (!provider) {
          socket.emit("requestError", {
            error:
              "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
          });
          return;
        }
        validProviderId = provider._id; // Use ObjectId directly, not string
      } else {
        // Convert string to ObjectId if it's a valid ObjectId string
        validProviderId = new mongoose.Types.ObjectId(providerId);
        console.log("🔍 Looking up provider by ObjectId:", validProviderId);
        provider = await User.findById(validProviderId);
        console.log("📊 Provider found by ObjectId:", !!provider);
        if (!provider) {
          socket.emit("requestError", {
            error:
              "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
          });
          return;
        }
      }

      const activeForProvider = await ConsultationRequest.findOne({
        providerId: validProviderId,
        status: { $in: PROVIDER_ACTIVE_STATUSES },
      }).select("_id status");
      if (activeForProvider) {
        socket.emit("requestError", {
          error:
            "You already have an ongoing consultation. Please complete or cancel it before accepting another request.",
        });
        return;
      }

      const acceptProviderCoordinates =
        normalizeCoordinates(providerLocation) ||
        normalizeCoordinates(socket.providerLocation);
      if (!acceptProviderCoordinates) {
        socket.emit("requestError", {
          error:
            "Your current location is required before accepting this consultation. Please refresh nearby requests and try again.",
        });
        return;
      }
      socket.providerLocation = acceptProviderCoordinates;

      await request.populate({
        path: "ailmentCategoryId",
        populate: {
          path: "specialization",
          select: "title",
        },
      });

      const visibilityCheck = providerCanSeeRequest(
        provider,
        request,
        acceptProviderCoordinates,
      );
      if (!visibilityCheck.allowed) {
        socket.emit("requestError", {
          error:
            visibilityCheck.reason ===
            "provider_role_or_specialization_mismatch"
              ? "This consultation is not available for your provider type or specialization."
              : "This consultation is no longer available in your current nearby search radius. Please refresh available requests.",
        });
        return;
      }

      
      if (!provider.isDocumentVerified) {
        socket.emit("requestError", {
          error:
            "Your account is pending verification. The admin must first approve your application before you can accept consultation requests. We'll notify you once your account has been verified. If verification is taking too long, please log a ticket in the issues section so we can assist you.",
        });
        return;
      }

      if (provider.consultations === 0) {
        socket.emit("requestError", {
          error:
            "You have no remaining consultation credits. Please select and purchase a package to continue accepting consultation requests.",
        });
        return;
      }

      const nextStatus =
        request.consultationMode === "video_consultation"
          ? "payment_pending"
          : "accepted";

      request.status = nextStatus;
      request.providerId = validProviderId;
      if (nextStatus === "payment_pending") {
        request.paymentStatus = "pending";
      }
      if (!(await ensureRequestConsultationCost(request))) {
        socket.emit("requestError", {
          error:
            "Consultation cost for this request is unavailable. Please contact support.",
        });
        return;
      }
      // Note: timeline.providerAccepted will be set automatically by pre-save hook
      // No need to manually set providerAssigned

      console.log(
        "💾 Saving request with status:",
        nextStatus,
        "providerId:",
        validProviderId,
      );
      console.log(
        "📝 Request before save - status:",
        request.status,
        "providerId:",
        request.providerId,
      );
      console.log("📝 Request timeline before save:", request.timeline);

      try {
        await request.save();
      } catch (saveError) {
        console.error("❌ Error during request.save():", saveError);
        console.error("❌ Validation errors:", saveError.errors);
        throw saveError;
      }

      console.log("✅ Request saved successfully");

      await request.populate("patientId", "fullname cellphoneNumber");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role profileImage",
      );
      await request.populate("ailmentCategoryId");

      // Emit acceptConfirmed to the assigned provider's socket (handshake to avoid client/server race)
      try {
        const providerId = request.providerId?._id?.toString();

        let providerSocketId = userSockets.get(providerId);

        if (providerSocketId) {
          console.log(
            "📣 Emitting acceptConfirmed to provider socket:",
            providerSocketId,
          );
          io.to(providerSocketId).emit("acceptConfirmed", {
            requestId: request._id.toString(),
          });
        } else {
          console.log(
            "⚠️ Provider socket not found for acceptConfirmed, ID:",
            providerId,
          );
        }
      } catch (e) {
        console.warn("⚠️ Failed to emit acceptConfirmed:", e);
      }
      console.log("✅ Request populated successfully");

      // Notify patient using their _id
      const patientId = request.patientId._id.toString();

      let patientSocketId = userSockets.get(patientId);

      console.log("📨 Looking up patient socket with ID:", patientId);
      console.log("📨 Patient socketId:", patientSocketId);

      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
        console.log("📨 Patient notified");
      } else {
        console.log("⚠️  Patient not online");
      }

      // Send push notification to patient
      const patientUser = await User.findById(request.patientId._id); // request.patientId is populated
      if (patientUser) {
        // Create persistent notification
        try {
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
        } catch (err) {
          console.error("Error creating notification:", err);
        }

        if (
          patientUser.expoPushToken &&
          patientUser.isPushNotificationEnabled
        ) {
          sendPushNotification(
            patientUser.expoPushToken,
            nextStatus === "payment_pending"
              ? "Payment Required"
              : "Request Accepted",
            nextStatus === "payment_pending"
              ? `${request.providerId.fullname} accepted your teleconsultation. Complete payment to continue.`
              : `${request.providerId.fullname} has accepted your request.`,
            { requestId: request._id },
          );
        }
      }

      // Notify provider
      console.log("📨 Notifying provider...");
      socket.emit("requestUpdated", request);

      // Notify all providers to refresh available requests
      console.log("📨 Broadcasting status change to all providers...");
      io.emit("requestStatusChanged", { requestId, status: nextStatus });
      console.log("✅ acceptRequest completed successfully");
    } catch (error) {
      console.error("❌ acceptRequest error:", error);
      console.error("❌ Error message:", error.message);
      console.error("❌ Error stack:", error.stack);
      socket.emit("requestError", {
        error: error.message || "Failed to accept request",
      });
    }
  });

  // Provider rejects a request
  socket.on("rejectRequest", async (data) => {
    try {
      const { requestId, providerId } = data;
      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", { error: "Request not found" });
        return;
      }

      // Resolve rejecting provider as a valid ObjectId (never a string)
      let rejectingProviderIdObj = null;
      // Prefer explicit providerId from client if present
      if (providerId) {
        if (mongoose.Types.ObjectId.isValid(providerId)) {
          rejectingProviderIdObj = new mongoose.Types.ObjectId(providerId);
        } else {
          const user = null;
          rejectingProviderIdObj = user ? user._id : null;
        }
      }
      // Fallback to socket.userId
      if (!rejectingProviderIdObj && socket.userId) {
        const user = mongoose.Types.ObjectId.isValid(socket.userId)
          ? await User.findById(socket.userId).select("_id")
          : null;
        rejectingProviderIdObj = user ? user._id : null;
      }

      await request.populate("patientId", "fullname cellphoneNumber");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role",
      );
      await request.populate({
        path: "ailmentCategoryId",
        populate: {
          path: "specialization",
          select: "title",
        },
      });

      // Behavior depends on current status
      // 1) 'searching': keep the request available to others, but hide it for this provider
      // 2) 'pending': clear providerId and move back to 'searching' (unless no providers remain)
      if (request.status === "searching") {
        if (rejectingProviderIdObj) {
          // Record this provider has rejected so they won't see it again
          if (
            !request.rejectedBy.some(
              (p) => p && p.toString() === rejectingProviderIdObj.toString(),
            )
          ) {
            request.rejectedBy.push(rejectingProviderIdObj);
          }
          if (!(await ensureRequestConsultationCost(request))) {
            socket.emit("requestError", {
              error:
                "Consultation cost for this request is unavailable. Please contact support.",
            });
            return;
          }
          await request.save();
        }

        // Check if there are any available providers (not busy and matching specializations)
        const ailmentCategory = request.ailmentCategoryId;

        // Get all online provider user IDs by checking socket roles
        const onlineProviderIds = [];
        for (const [userId, socketId] of userSockets.entries()) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.role && PROVIDER_ROLES.includes(socket.role)) {
            onlineProviderIds.push(userId);
          }
        }

        // Convert online provider ids to full user objects to check specializations
        const onlineProviderUsers = await User.find({
          _id: { $in: onlineProviderIds },
        });

        // Filter providers by specialization match
        const matchingProviderUsers = onlineProviderUsers.filter((provider) =>
          providerMatchesAilment(provider, ailmentCategory),
        );

        const matchingProviderIds = matchingProviderUsers.map((user) => user._id);

        // Check which providers are busy
        const busyProviderIds =
          matchingProviderIds.length > 0
            ? await ConsultationRequest.distinct("providerId", {
                providerId: { $in: matchingProviderIds },
                status: { $in: PROVIDER_ACTIVE_STATUSES },
              })
            : [];

        // Available providers = online providers who match specializations, are not busy, and have not rejected
        const availableProviderIds = matchingProviderIds.filter(
          (id) => {
            const providerSocketId = userSockets.get(id.toString());
            const providerSocket = providerSocketId
              ? io.sockets.sockets.get(providerSocketId)
              : null;
            const providerUser = matchingProviderUsers.find(
              (user) => user._id.toString() === id.toString(),
            );
            const visibilityCheck = providerCanSeeRequest(
              providerUser,
              request,
              providerSocket?.providerLocation,
            );

            return (
              visibilityCheck.allowed &&
              !busyProviderIds.some(
              (busyId) => busyId && busyId.toString() === id.toString(),
              ) &&
              !request.rejectedBy.some(
              (rid) => rid && rid.toString() === id.toString(),
              )
            );
          },
        );

        // If no providers are available, notify patient with friendly message
        if (availableProviderIds.length === 0) {
          const patientIdKey = request.patientId._id.toString();
          const patientSocketId = userSockets.get(patientIdKey);
          if (patientSocketId) {
            io.to(patientSocketId).emit("providerUnavailable", {
              requestId: request._id,
              message:
                "All our health providers are currently busy. Please try again later or contact support for assistance.",
              ailmentCategory:
                request.ailmentCategoryId?.title || "your request",
            });
          }
          // Optionally expire the request since nobody can take it
          request.status = "expired";
          if (!(await ensureRequestConsultationCost(request))) {
            socket.emit("requestError", {
              error:
                "Consultation cost for this request is unavailable. Please contact support.",
            });
            return;
          }
          await request.save();
          if (patientSocketId) {
            io.to(patientSocketId).emit("requestUpdated", request);
          }
          io.emit("requestStatusChanged", { requestId, status: "expired" });
        } else {
          // Hide from rejecting provider only
          socket.emit("requestHidden", { requestId: request._id });
          // Still available to others; no global 'rejected' broadcast
        }
      } else if (request.status === "pending") {
        // If it was assigned and provider rejected, put back to searching for others (unless none are available)
        request.providerId = undefined;
        if (rejectingProviderIdObj) {
          if (
            !request.rejectedBy.some(
              (p) => p && p.toString() === rejectingProviderIdObj.toString(),
            )
          ) {
            request.rejectedBy.push(rejectingProviderIdObj);
          }
        }
        request.status = "searching";
        if (!(await ensureRequestConsultationCost(request))) {
          socket.emit("requestError", {
            error:
              "Consultation cost for this request is unavailable. Please contact support.",
          });
          return;
        }
        await request.save();
        // Notify rejecting provider to hide
        socket.emit("requestHidden", { requestId: request._id });

        // Notify others there's an available request again, but only to providers matching specializations
        const ailmentCategory = request.ailmentCategoryId;
        for (const [socketUserId, socketId] of userSockets.entries()) {
          const targetSocket = io.sockets.sockets.get(socketId);
          if (
            !targetSocket ||
            !targetSocket.role ||
            targetSocket.role === "patient"
          )
            continue;

          // Skip the rejecting provider
          if (
            rejectingProviderIdObj &&
            socketUserId === rejectingProviderIdObj.toString()
          )
            continue;

          // Find provider by _id
          let provider = null;
          if (mongoose.Types.ObjectId.isValid(socketUserId)) {
            provider = await User.findById(socketUserId);
          }

          // Check if provider matches the ailment category's specializations
          if (!providerCanSeeRequest(provider, request, targetSocket.providerLocation).allowed) {
            continue;
          }

          // Check if provider is busy
          let providerObjectId = provider ? provider._id : null;
          let isBusy = false;
          if (providerObjectId) {
            const activeForProvider = await ConsultationRequest.findOne({
              providerId: providerObjectId,
              status: { $in: PROVIDER_ACTIVE_STATUSES },
            }).select("_id");
            isBusy = Boolean(activeForProvider);
          }

          // Check if provider has already rejected this request
          const hasRejected =
            providerObjectId &&
            request.rejectedBy.some(
              (rid) => rid && rid.toString() === providerObjectId.toString(),
            );

          if (!isBusy && !hasRejected) {
            io.to(socketId).emit("newRequestAvailable", request);
          }
        }
      } else {
        // For other statuses, default to standard update
        socket.emit("requestUpdated", request);
        io.emit("requestStatusChanged", { requestId, status: "rejected" });
      }

      // Notify patient of the updated request (if not already sent above)
      const patientIdKey = request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientIdKey);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Update request status
  socket.on("updateRequestStatus", async (data) => {
    try {
      const { requestId, status, notes, providerLocation, providerId } = data;
      console.log("📤 Received updateRequestStatus:", {
        requestId,
        status,
        hasLocation: !!providerLocation,
        providerId,
      });
      console.log("📤 RequestId type:", typeof requestId, "Value:", requestId);

      // Convert string ID to ObjectId
      let objectId;
      try {
        objectId = new mongoose.Types.ObjectId(requestId);
        console.log("✅ Converted to ObjectId:", objectId);
      } catch (err) {
        console.error("❌ Invalid ObjectId format:", requestId);
        socket.emit("requestError", { error: "Invalid request ID format" });
        return;
      }

      // Debug: Check all requests in database
      const allRequests = await ConsultationRequest.find({})
        .select("_id status")
        .limit(5);
      console.log(
        "📊 All requests in database (first 5):",
        allRequests.map((r) => ({ id: r._id.toString(), status: r.status })),
      );
      console.log(
        "📊 Total requests in database:",
        await ConsultationRequest.countDocuments(),
      );

      const request = await ConsultationRequest.findById(objectId);
      console.log(
        "🔍 Database lookup result:",
        request ? "✅ Found" : "❌ Not found",
      );

      if (!request) {
        console.error("❌ Request not found in database for ID:", requestId);
        socket.emit("requestError", {
          error:
            "We couldn't find this consultation request. It may have been cancelled or already completed. Please refresh and try again.",
        });
        return;
      }

      // Validate status transitions
      const validTransitions = {
        accepted: ["en_route", "cancelled"],
        payment_pending: ["provider_confirmation_pending", "cancelled"],
        paid: ["provider_confirmation_pending", "ready_for_call", "cancelled"],
        provider_confirmation_pending: ["ready_for_call", "cancelled"],
        ready_for_call: ["in_call", "cancelled"],
        in_call: ["completed", "cancelled"],
        en_route: ["arrived", "cancelled"],
        arrived: ["in_progress", "completed", "cancelled"],
        in_progress: ["completed", "cancelled"],
      };

      if (
        validTransitions[request.status] &&
        !validTransitions[request.status].includes(status)
      ) {
        socket.emit("requestError", {
          error: `Invalid status transition from ${request.status} to ${status}`,
        });
        return;
      }

      if (status === "provider_confirmation_pending") {
        const patientIdentifier = providerId || socket.userId;
        let validPatientId = null;

        if (!patientIdentifier) {
          socket.emit("requestError", {
            error: "Patient identification is required to confirm payment.",
          });
          return;
        }

        if (mongoose.Types.ObjectId.isValid(patientIdentifier)) {
          validPatientId = new mongoose.Types.ObjectId(patientIdentifier);
        } else {
          const patientUser = null;
          validPatientId = patientUser ? patientUser._id : null;
        }

        if (
          !validPatientId ||
          !request.patientId ||
          request.patientId.toString() !== validPatientId.toString()
        ) {
          socket.emit("requestError", {
            error:
              "Only the patient who created this request can confirm teleconsultation payment.",
          });
          return;
        }

        if (request.consultationMode !== "video_consultation") {
          socket.emit("requestError", {
            error: "Payment confirmation is only available for teleconsultations.",
          });
          return;
        }

        request.paymentStatus = "pending";
      }

      // Validate provider can only update their own requests
      if (
        [
          "paid",
          "ready_for_call",
          "in_call",
          "en_route",
          "arrived",
          "in_progress",
          "completed",
        ].includes(status)
      ) {
        // Use providerId from data if available, otherwise fallback to socket.userId
        const providerIdentifier = providerId || socket.userId;
        console.log(
          "🔐 Provider validation - identifier:",
          providerIdentifier,
          "request.providerId:",
          request.providerId?.toString(),
        );

        let validProviderId = null;
        if (mongoose.Types.ObjectId.isValid(providerIdentifier)) {
          validProviderId = new mongoose.Types.ObjectId(providerIdentifier);
        } else {
          const user = null;
          if (user) {
            validProviderId = user._id;
          } else {
            socket.emit("requestError", {
              error:
                "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
            });
            return;
          }
        }

        console.log(
          "🔐 Comparing - validProviderId:",
          validProviderId?.toString(),
          "request.providerId:",
          request.providerId?.toString(),
        );
        if (
          !request.providerId ||
          request.providerId.toString() !== validProviderId.toString()
        ) {
          console.error(
            "❌ Provider ID mismatch - user not assigned to this request",
          );
          socket.emit("requestError", {
            error:
              "You are not assigned to this consultation request. Only the assigned provider can update this request.",
          });
          return;
        }

        if (
          ["paid", "ready_for_call", "in_call"].includes(status) &&
          request.consultationMode !== "video_consultation"
        ) {
          socket.emit("requestError", {
            error:
              "Teleconsultation call states are only available for video consultation requests.",
          });
          return;
        }
      }

      if (status === "ready_for_call") {
        request.paymentStatus = "paid";
      }

      // Update provider location when status is en_route
      if (status === "en_route") {
        if (
          !providerLocation ||
          !providerLocation.latitude ||
          !providerLocation.longitude
        ) {
          socket.emit("requestError", {
            error:
              "Provider location (latitude and longitude) is required when going en_route",
          });
          return;
        }

        // Initialize locationTracking if it doesn't exist
        if (!request.locationTracking) {
          request.locationTracking = {};
        }

        // Update provider location
        request.locationTracking.providerLocation = {
          latitude: providerLocation.latitude,
          longitude: providerLocation.longitude,
          lastUpdated: new Date(),
        };

        // Mark locationTracking as modified to ensure it's saved
        request.markModified("locationTracking");
      }

      request.status = status;

      if (!(await ensureRequestConsultationCost(request))) {
        socket.emit("requestError", {
          error:
            "Consultation cost for this request is unavailable. Please contact support.",
        });
        return;
      }

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role",
      );
      await request.populate("ailmentCategoryId");

      // Process payment when consultation is completed
      if (status === "completed") {
          const provider = await User.findById(request.providerId._id);
          provider.consultations = provider.consultations - 1;

                 await provider.save();
      }

      // Notify patient using _id
      const patientId = request.patientId._id.toString();

      let patientSocketId = userSockets.get(patientId);

      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Send push notification to patient based on status
      const patientUser = await User.findById(request.patientId._id);
      if (patientUser) {
        let title = "Update on your request";
        let body = `Your request status is now ${status}`;
        let type = "consultation_updated";

        if (status === "payment_pending") {
          title = "Payment Required";
          body = `${request.providerId.fullname} accepted your teleconsultation. Pay the provider, then confirm payment in the app.`;
          type = "consultation_payment_pending";
        } else if (status === "paid") {
          title = "Payment Received";
          body = "Your provider confirmed they received the payment.";
          type = "consultation_paid";
        } else if (status === "provider_confirmation_pending") {
          title = "Payment Marked As Sent";
          body =
            "Your provider has been asked to confirm they received your payment.";
          type = "consultation_provider_confirmation_pending";
        } else if (status === "ready_for_call") {
          title = "Ready For Call";
          body = "Your teleconsultation is ready to begin.";
          type = "consultation_ready_for_call";
        } else if (status === "in_call") {
          title = "Consultation In Progress";
          body = "Your video consultation is now in progress.";
          type = "consultation_in_call";
        } else if (status === "en_route") {
          title = "Provider En Route";
          body = `${request.providerId.fullname} is on the way!`;
          type = "consultation_en_route";
        } else if (status === "arrived") {
          title = "Provider Arrived";
          body = `${request.providerId.fullname} has arrived at your location.`;
          type = "consultation_arrived";
        } else if (status === "completed") {
          title = "Consultation Completed";
          body = "Your consultation has been completed. Thank you!";
          type = "consultation_completed";
        }

        if (status !== "searching") {
          // Don't notify for searching status updates usually
          // Create persistent notification
          try {
            await Notification.createNotification({
              userId: patientUser._id,
              type: type,
              title: title,
              message: body,
              status: "sent",
              data: { requestId: request._id },
            });
          } catch (err) {
            console.error("Error creating notification:", err);
          }

          if (
            patientUser.expoPushToken &&
            patientUser.isPushNotificationEnabled
          ) {
            sendPushNotification(patientUser.expoPushToken, title, body, {
              requestId: request._id,
            });
          }
        }
      }

      // Notify provider using _id
      if (request.providerId) {
        const providerId = request.providerId._id.toString();

        let providerSocketId = userSockets.get(providerId);

        if (providerSocketId) {
          io.to(providerSocketId).emit("requestUpdated", request);
        }
      }

      socket.emit("requestUpdated", request);
      io.emit("requestStatusChanged", { requestId, status });
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Cancel request
  socket.on("cancelRequest", async (data) => {
    try {
      const { requestId, cancelledBy, reason } = data;
      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", {
          error:
            "We couldn't find this consultation request. It may have been cancelled or already completed. Please refresh and try again.",
        });
        return;
      }

      // Store original status before cancellation to check if provider should become available
      const originalStatus = request.status;

      // Validate cancellation - provider can only cancel before arrival
      if (cancelledBy === "provider") {
        if (!mongoose.Types.ObjectId.isValid(socket.userId)) {
          socket.emit("requestError", {
            error:
              "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
          });
          return;
        }
        const validProviderId = new mongoose.Types.ObjectId(socket.userId);

        // Check if this provider is assigned to this request
        if (
          !request.providerId ||
          request.providerId.toString() !== validProviderId.toString()
        ) {
          socket.emit("requestError", {
            error:
              "You are not assigned to this consultation request. Only the assigned provider can cancel this request.",
          });
          return;
        }

        // Provider can only cancel before arrival
        if (["arrived", "in_progress", "completed"].includes(request.status)) {
          socket.emit("requestError", {
            error: "Cannot cancel request after arrival",
          });
          return;
        }
      }

      request.status = "cancelled";
      request.cancellation = {
        cancelledBy,
        reason: reason || "No reason provided",
        cancelledAt: new Date(),
      };

      if (!(await ensureRequestConsultationCost(request))) {
        socket.emit("requestError", {
          error:
            "Consultation cost for this request is unavailable. Please contact support.",
        });
        return;
      }

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role",
      );
      await request.populate("ailmentCategoryId");

      // Notify patient using _id
      const patientId = request.patientId._id.toString();

      let patientSocketId = userSockets.get(patientId);

      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider if assigned
      if (request.providerId) {
        const providerId = request.providerId._id.toString();

        let providerSocketId = userSockets.get(providerId);

        if (providerSocketId) {
          io.to(providerSocketId).emit("requestUpdated", request);

          // If patient cancelled an accepted request, provider is now available
          // Check if the request was in an active status before cancellation
          const wasActiveStatus = [
            "accepted",
            "payment_pending",
            "paid",
            "provider_confirmation_pending",
            "ready_for_call",
            "in_call",
            "en_route",
            "arrived",
            "in_progress",
          ].includes(originalStatus);
          if (cancelledBy === "patient" && wasActiveStatus) {
            // Provider is now available - notify them so they can refresh their available requests
            io.to(providerSocketId).emit("providerAvailable", {
              message:
                "The consultation was cancelled. You are now available for new consultations.",
            });
          }
        }
      }

      // Send push notification to the other party
      if (cancelledBy === "patient" && request.providerId) {
        const providerUser = await User.findById(request.providerId._id);
        if (
          providerUser &&
          providerUser.expoPushToken &&
          providerUser.isPushNotificationEnabled
        ) {
          sendPushNotification(
            providerUser.expoPushToken,
            "Request Cancelled",
            "The patient has cancelled the consultation request.",
            { requestId: request._id },
          );
        }
      } else if (cancelledBy === "provider") {
        const patientUser = await User.findById(request.patientId._id);
        if (
          patientUser &&
          patientUser.expoPushToken &&
          patientUser.isPushNotificationEnabled
        ) {
          sendPushNotification(
            patientUser.expoPushToken,
            "Request Cancelled",
            "The provider has cancelled the consultation request.",
            { requestId: request._id },
          );
        }
      }

      // Notify all providers to remove cancelled request from available requests
      io.emit("requestStatusChanged", { requestId, status: "cancelled" });

      socket.emit("requestUpdated", request);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (socket.role && onlineUsers[socket.role]) {
      onlineUsers[socket.role].delete(socket.id);

      // Remove from userSockets
      if (socket.userId) {
        userSockets.delete(socket.userId);
      }

      // Calculate total online users
      const totalOnline = Object.values(onlineUsers).reduce(
        (sum, users) => sum + users.size,
        0,
      );

      // Emit updated online users count to all clients
      io.emit("onlineUsersUpdate", {
        byRole: {
          patient: onlineUsers.patient.size,
          doctor: onlineUsers.doctor.size,
          nurse: onlineUsers.nurse.size,
          physiotherapist: onlineUsers.physiotherapist.size,
          "social worker": onlineUsers["social worker"].size,
          pharmacist: onlineUsers.pharmacist.size,
        },
        total: totalOnline,
      });

      console.log(
        `User ${socket.id} disconnected. Total online: ${totalOnline}`,
      );
    }
  });
});

schedule.scheduleJob("*/30 * * * *", async () => {
  console.log(
    "Running task every 30 minutes - Checking for expired qualifications...",
  );

  try {
    const currentDate = new Date();

    // Find all health providers with specific roles
    const healthProviders = await User.find({
      role: { $in: ["doctor", "nurse", "physiotherapist", "social worker"] },
      hpcnaExpiryDate: { $exists: true, $ne: null },
    });

    let expiredCount = 0;

    for (const provider of healthProviders) {
      // Check if hpcnaExpiryDate has expired
      if (
        provider.hpcnaExpiryDate < currentDate &&
        provider.isDocumentVerified
      ) {
        // Update isDocumentVerified to false
        provider.isDocumentVerified = false;
        await provider.save();

        expiredCount++;

        // Create notification in database
        await Notification.createNotification({
          userId: provider._id,
          type: "qualification_expired",
          title: "Qualification Expired",
          message:
            "Your qualification has expired. Please renew your qualification to continue using our services.",
          data: {
            expiryDate: provider.hpcnaExpiryDate,
            role: provider.role,
          },
          priority: "high",
          channels: {
            inApp: true,
            push: true,
            email: false,
            sms: false,
          },
        });

        // Send push notification to the user
        if (provider.expoPushToken && provider.isPushNotificationEnabled) {
          sendPushNotification(
            provider.expoPushToken,
            "Qualification Expired",
            "Your qualification has expired. Please renew your qualification to continue using our services.",
            { type: "qualification_expired" },
          );
        }

        console.log(
          `Qualification expired for user: ${provider.fullname} (${provider._id})`,
        );
      }
    }

    console.log(
      `Task completed. Found ${expiredCount} expired qualifications out of ${healthProviders.length} health providers.`,
    );
  } catch (error) {
    console.error("Error checking expired qualifications:", error);
  }
});

// Scheduled job to check for qualifications expiring in 7 days (runs daily at 9:00 AM)
schedule.scheduleJob("0 9 * * *", async () => {
  console.log(
    "Running daily task - Checking for qualifications expiring in 7 days...",
  );

  try {
    const currentDate = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(currentDate.getDate() + 7);

    // Set time to start and end of the day for accurate comparison
    const startOfDay = new Date(sevenDaysFromNow);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(sevenDaysFromNow);
    endOfDay.setHours(23, 59, 59, 999);

    // Find all health providers with qualifications expiring in 7 days
    const healthProviders = await User.find({
      role: { $in: ["doctor", "nurse", "physiotherapist", "social worker"] },
      hpcnaExpiryDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      isDocumentVerified: true,
    });

    let notifiedCount = 0;

    for (const provider of healthProviders) {
      // Check if notification already exists to avoid duplicate notifications
      const existingNotification = await Notification.findOne({
        userId: provider._id,
        type: "qualification_expiring_soon",
        createdAt: {
          $gte: new Date(currentDate.getTime() - 8 * 24 * 60 * 60 * 1000), // Within last 8 days
        },
      });

      // Only send if no recent notification exists
      if (!existingNotification) {
        // Create notification in database
        await Notification.createNotification({
          userId: provider._id,
          type: "qualification_expiring_soon",
          title: "Qualification Expiring Soon",
          message:
            "Your qualification will expire in 7 days. Please renew your qualification to continue using our services.",
          data: {
            expiryDate: provider.hpcnaExpiryDate,
            role: provider.role,
            daysRemaining: 7,
          },
          priority: "high",
          channels: {
            inApp: true,
            push: true,
            email: false,
            sms: false,
          },
        });

        // Send push notification to the user
        if (provider.expoPushToken && provider.isPushNotificationEnabled) {
          sendPushNotification(
            provider.expoPushToken,
            "Qualification Expiring Soon",
            "Your qualification will expire in 7 days. Please renew your qualification to continue using our services.",
            {
              type: "qualification_expiring_soon",
              daysRemaining: 7,
            },
          );
        }

        notifiedCount++;
        console.log(
          `Notification sent to user: ${provider.fullname} (${provider._id}) - Expiry: ${provider.hpcnaExpiryDate.toDateString()}`,
        );
      }
    }

    console.log(
      `[Qualification Expiry Cron] Notified ${notifiedCount} provider(s).`,
    );
  } catch (err) {
    console.error("[Qualification Expiry Cron] Error:", err.message);
  }
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    server.listen(PORT, () => {
      console.log("Server running on port " + PORT);
    });
  })
  .catch(function(err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
