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

app.use("/api/portal/auth", authPortalRouter);
app.use("/api/portal/request", requestPortalRouter);
app.use("/api/portal/adverts", advertsRouter);
app.use("/api/portal/packages", packagesPortalRouter);

const onlineUsers = {
  patient: new Set(),
  doctor: new Set(),
  nurse: new Set(),
  physiotherapist: new Set(),
  "social worker:": new Set(),
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

    // Check if provider role matches ailment category's provider type (if specified)
    if (ailmentCategory.provider) {
      const roleMapping = {
        doctor: "Doctor",
        nurse: "Nurse",
        physiotherapist: "Physiotherapist",
        "social worker": "Social Worker",
      };
      const expectedProviderType = roleMapping[provider.role?.toLowerCase()];
      if (
        expectedProviderType &&
        ailmentCategory.provider !== expectedProviderType
      ) {
        return false;
      }
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
          "social worker:": onlineUsers["social worker:"].size,
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
        urgency,
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
          "fullname cellphoneNumber walletID",
        );
        await existingActive.populate("ailmentCategoryId");

        socket.emit("requestError", {
          error:
            "You already have an active consultation request. Please complete or cancel it before creating a new one.",
          existingRequestId: existingActive._id,
        });
        return;
      }

      // Get ailment category to get initialCost (which becomes estimatedCost)
      // Be tolerant if category id is missing or invalid (some older clients may send bad ids)
      let initialCost = 0;
      let ailmentCategory = null;
      try {
        if (
          ailmentCategoryId &&
          mongoose.Types.ObjectId.isValid(ailmentCategoryId)
        ) {
          ailmentCategory = await AilmentCategory.findById(ailmentCategoryId);
        }
      } catch (e) {
        console.warn(
          "⚠️ createRequest: failed to lookup ailmentCategoryId",
          ailmentCategoryId,
          e,
        );
      }

      if (ailmentCategory && ailmentCategory.initialCost != null) {
        initialCost = parseFloat(ailmentCategory.initialCost) || 0;
      } else {
        console.warn(
          "⚠️ createRequest: ailmentCategory not found or invalid - defaulting initialCost to 0",
        );
      }

      if (isNaN(initialCost) || initialCost <= 0) {
        socket.emit("requestError", {
          error:
            "We're having trouble processing your request. Please try again or contact support if the issue persists.",
        });
        return;
      }

      // Use initialCost as estimatedCost
      const estimatedCost = initialCost.toString();

      // Check wallet balance if payment method is wallet
      if (paymentMethod === "wallet") {
        const patientBalance = parseFloat(patient.balance || 0);
        if (patientBalance < initialCost) {
          const shortfall = (initialCost - patientBalance).toFixed(2);
          socket.emit("requestError", {
            error: `Your wallet balance is insufficient for this consultation. You need N$${initialCost.toFixed(2)}, but you currently have N$${patientBalance.toFixed(2)}. Please add N$${shortfall} to your wallet or choose Cash payment instead.`,
          });
          return;
        }
      }

      const request = new ConsultationRequest({
        patientId: validPatientId,
        ailmentCategoryId,
        urgency: urgency || "medium",
        address,
        preferredTime: Date.now(),
        estimatedCost,
        paymentMethod: paymentMethod,
        status: "searching",
        consultationMode,
      });

      await request.save();
      await request.populate(
        "patientId",
        "fullname cellphoneNumber walletID profileImage",
      );
      await request.populate("ailmentCategoryId");

      // Notify patient using their walletID
      const patientSocketId = userSockets.get(patientId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestCreated", request);
      }

      // Notify all providers about new available request
      // Only notify providers that are not currently busy and match the ailment specialization
      const providerActiveStatuses = [
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
      const populatedAilmentCategory = request.ailmentCategoryId;

      for (const [socketUserId, socketId] of userSockets.entries()) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (
          !targetSocket ||
          !targetSocket.role ||
          targetSocket.role === "patient"
        )
          continue;

        // Find provider by walletID (socketUserId) or _id to determine busy status
        let provider = null;
        if (mongoose.Types.ObjectId.isValid(socketUserId)) {
          provider = await User.findById(socketUserId);
        }
        if (!provider) {
          provider = await User.findOne({ walletID: socketUserId });
        }

        // Check if provider matches the ailment category's specializations
        if (!providerMatchesAilment(provider, populatedAilmentCategory)) {
          continue; // Skip this provider if they don't match the specialization
        }

        let providerObjectId = provider ? provider._id : null;

        // If provider record not found yet (e.g., first time), treat as not busy
        let isBusy = false;
        if (providerObjectId) {
          const activeForProvider = await ConsultationRequest.findOne({
            providerId: providerObjectId,
            status: { $in: providerActiveStatuses },
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
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate("providerId", "fullname cellphoneNumber role walletID")
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
      const { providerId } = data;
      console.log("🔍 getAvailableRequests handler - providerId:", providerId);

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

      // Get provider by identifier (could be ObjectId or walletID)
      if (!mongoose.Types.ObjectId.isValid(identifier)) {
        provider = await User.findOne({ walletID: identifier });
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
      const providerActiveStatuses = [
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
      if (validProviderId) {
        const activeForProvider = await ConsultationRequest.findOne({
          providerId: validProviderId,
          status: { $in: providerActiveStatuses },
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
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate({
          path: "ailmentCategoryId",
          populate: {
            path: "specialization",
            select: "title",
          },
        })
        .sort({ createdAt: -1 });

      // Always filter requests based on provider's specializations
      const filteredRequests = requests.filter((request) => {
        const ailmentCategory = request.ailmentCategoryId;
        return providerMatchesAilment(provider, ailmentCategory);
      });
      console.log(
        `✅ Filtered requests from ${requests.length} to ${filteredRequests.length} based on provider specializations`,
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
        .sort({ priority: 1 });
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

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role walletID",
      );
      await request.populate("ailmentCategoryId");

      // Notify patient
      const patientWalletId =
        request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);
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
        const user = await User.findOne({ walletID: providerId });
        if (user) {
          validProviderId = user._id; // Use ObjectId directly for queries
          console.log("🔍 Converted walletID to ObjectId:", validProviderId);
        } else {
          console.log("⚠️ Provider not found in DB with walletID:", providerId);
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
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate("providerId", "fullname cellphoneNumber role walletID")
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
      const patientWalletId =
        request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);

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
      const { requestId, providerId } = data;

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
          "🔍 Provider ID is not ObjectId, looking up by walletID...",
        );
        provider = await User.findOne({ walletID: providerId });
        console.log("📊 Provider found by walletID:", !!provider);
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

      // Populate ailmentCategoryId to get commission
      console.log("🔍 Populating ailmentCategoryId...");
      await request.populate("ailmentCategoryId");
      console.log("📊 ailmentCategoryId:", request.ailmentCategoryId);
      console.log("📊 paymentMethod:", request.paymentMethod);

      // Verify wallet balance for cash payments (deduction happens on completion)
      if (request.paymentMethod === "cash") {
        console.log("💰 Payment method is cash, checking commission...");

        // If ailmentCategoryId isn't set (existing requests created without a proper category),
        // default commission to 0 and allow acceptance. This prevents blocking providers from
        // accepting older requests where the front-end didn't provide a valid ObjectId.
        let commission = 0;
        if (
          request.ailmentCategoryId &&
          request.ailmentCategoryId.commission != null
        ) {
          commission = parseFloat(request.ailmentCategoryId.commission) || 0;
        } else {
          console.warn(
            "⚠️ ailmentCategoryId missing or has no commission - defaulting commission to 0",
          );
        }

        const providerBalance = parseFloat(provider.balance || 0);
        console.log(
          "💰 Commission:",
          commission,
          "Provider Balance:",
          providerBalance,
          "Is NaN:",
          isNaN(commission),
        );

        // if (isNaN(commission) || commission < 0) {
        //   console.error('❌ Invalid commission value:', request.ailmentCategoryId ? request.ailmentCategoryId.commission : 'null', 'Parsed:', commission);
        //   console.log('💰 Skipping commission check (commission is 0 or invalid)');
        // } else if (commission > 0 && providerBalance < commission) {
        //   const shortfall = (commission - providerBalance).toFixed(2);
        //   console.error('❌ Provider insufficient balance. Need:', commission, 'Have:', providerBalance);
        //   socket.emit("requestError", {
        //     error: `You need N$${commission.toFixed(2)} in your wallet to accept this cash payment consultation, but you currently have N$${providerBalance.toFixed(2)}. Please add N$${shortfall} to your wallet to proceed.`,
        //   });
        //   return;
        // }
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

      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role walletID profileImage",
      );
      await request.populate("ailmentCategoryId");

      // Emit acceptConfirmed to the assigned provider's socket (handshake to avoid client/server race)
      try {
        const providerWalletId = request.providerId?.walletID;
        const providerId = request.providerId?._id?.toString();

        let providerSocketId = userSockets.get(providerId);
        if (!providerSocketId && providerWalletId) {
          providerSocketId = userSockets.get(providerWalletId);
        }

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

      // Notify patient - find patient's socket using their walletID or _id
      const patientWalletId = request.patientId.walletID;
      const patientId = request.patientId._id.toString();

      let patientSocketId = userSockets.get(patientId);
      if (!patientSocketId && patientWalletId) {
        patientSocketId = userSockets.get(patientWalletId);
      }

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
          const user = await User.findOne({ walletID: providerId }).select(
            "_id",
          );
          rejectingProviderIdObj = user ? user._id : null;
        }
      }
      // Fallback to socket.userId (usually walletID set on join)
      if (!rejectingProviderIdObj && socket.userId) {
        const user = await User.findOne({ walletID: socket.userId }).select(
          "_id",
        );
        rejectingProviderIdObj = user ? user._id : null;
      }

      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role walletID",
      );
      await request.populate("ailmentCategoryId");

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
          await request.save();
        }

        // Check if there are any available providers (not busy and matching specializations)
        const providerRoles = [
          "doctor",
          "nurse",
          "physiotherapist",
          "social worker:",
        ];
        const providerActiveStatuses = [
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
        const ailmentCategory = request.ailmentCategoryId;

        // Get all online provider user IDs by checking socket roles
        const onlineProviderWalletIds = [];
        for (const [userId, socketId] of userSockets.entries()) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.role && providerRoles.includes(socket.role)) {
            onlineProviderWalletIds.push(userId);
          }
        }

        // Convert walletIDs to full user objects to check specializations
        const onlineProviderUsers = await User.find({
          walletID: { $in: onlineProviderWalletIds },
        });

        // Filter providers by specialization match
        const matchingProviderUsers = onlineProviderUsers.filter((provider) =>
          providerMatchesAilment(provider, ailmentCategory),
        );

        const onlineProviderIds = matchingProviderUsers.map((user) => user._id);

        // Check which providers are busy
        const busyProviderIds =
          onlineProviderIds.length > 0
            ? await ConsultationRequest.distinct("providerId", {
                providerId: { $in: onlineProviderIds },
                status: { $in: providerActiveStatuses },
              })
            : [];

        // Available providers = online providers who match specializations, are not busy, and have not rejected
        const availableProviderIds = onlineProviderIds.filter(
          (id) =>
            !busyProviderIds.some(
              (busyId) => busyId && busyId.toString() === id.toString(),
            ) &&
            !request.rejectedBy.some(
              (rid) => rid && rid.toString() === id.toString(),
            ),
        );

        // If no providers are available, notify patient with friendly message
        if (availableProviderIds.length === 0) {
          const patientWalletId =
            request.patientId.walletID || request.patientId._id.toString();
          const patientSocketId = userSockets.get(patientWalletId);
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
        await request.save();
        // Notify rejecting provider to hide
        socket.emit("requestHidden", { requestId: request._id });

        // Notify others there's an available request again, but only to providers matching specializations
        const ailmentCategory = request.ailmentCategoryId;
        const providerActiveStatuses = [
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

          // Find provider by walletID (socketUserId) or _id
          let provider = null;
          if (mongoose.Types.ObjectId.isValid(socketUserId)) {
            provider = await User.findById(socketUserId);
          }
          if (!provider) {
            provider = await User.findOne({ walletID: socketUserId });
          }

          // Check if provider matches the ailment category's specializations
          if (!providerMatchesAilment(provider, ailmentCategory)) {
            continue; // Skip this provider if they don't match the specialization
          }

          // Check if provider is busy
          let providerObjectId = provider ? provider._id : null;
          let isBusy = false;
          if (providerObjectId) {
            const activeForProvider = await ConsultationRequest.findOne({
              providerId: providerObjectId,
              status: { $in: providerActiveStatuses },
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
      const patientWalletId =
        request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);
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
        payment_pending: ["paid", "cancelled"],
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

      if (status === "paid") {
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
          const patientUser = await User.findOne({ walletID: patientIdentifier });
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

        request.paymentStatus = "paid";
      }

      // Validate provider can only update their own requests
      if (
        [
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
          const user = await User.findOne({ walletID: providerIdentifier });
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
          ["ready_for_call", "in_call"].includes(status) &&
          request.consultationMode !== "video_consultation"
        ) {
          socket.emit("requestError", {
            error:
              "Teleconsultation call states are only available for video consultation requests.",
          });
          return;
        }
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

      // Add notes if provided
      if (notes) {
        if (status === "in_progress") {
          request.consultationDetails = {
            ...request.consultationDetails,
            notes,
            startTime: new Date(),
          };
        } else if (status === "completed") {
          request.consultationDetails = {
            ...request.consultationDetails,
            ...request.consultationDetails,
            endTime: new Date(),
          };
        }
      } else if (status === "in_progress") {
        // Set start time even without notes
        request.consultationDetails = {
          ...request.consultationDetails,
          startTime: new Date(),
        };
      } else if (status === "completed") {
        // Set end time
        request.consultationDetails = {
          ...request.consultationDetails,
          endTime: new Date(),
        };
      }

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role walletID",
      );
      await request.populate("ailmentCategoryId");

      // Process payment when consultation is completed
      if (status === "completed") {
          const provider = await User.findById(request.providerId._id);
          provider.consultations = provider.consultations - 1;

                 await provider.save();
        // try {
        //   if (request.paymentMethod === "wallet") {
        //     // Get ailment category to get initialCost and cost
        //     const ailmentCategory = request.ailmentCategoryId;
        //     if (!ailmentCategory) {
        //       socket.emit("requestError", {
        //         error:
        //           "We're having trouble processing the payment. Please try again or contact support if the issue persists.",
        //       });
        //       return;
        //     }

        //     const initialCost = parseFloat(ailmentCategory.initialCost); // Full amount patient pays
        //     const cost = parseFloat(ailmentCategory.cost); // Amount provider receives (initialCost - commission)

        //     if (
        //       !isNaN(initialCost) &&
        //       initialCost > 0 &&
        //       !isNaN(cost) &&
        //       cost > 0
        //     ) {
        //       // Get patient and provider
        //       const patient = await User.findById(request.patientId._id);
        //       const provider = await User.findById(request.providerId._id);

        //       if (patient && provider) {
        //         const patientBalance = parseFloat(patient.balance || 0);

        //         // Check patient has enough balance
        //         if (patientBalance < initialCost) {
        //           const shortfall = (initialCost - patientBalance).toFixed(2);
        //           socket.emit("requestError", {
        //             error: `Unable to complete payment. The patient's wallet balance (N$${patientBalance.toFixed(2)}) is insufficient for the consultation cost (N$${initialCost.toFixed(2)}). Please ask the patient to add N$${shortfall} to their wallet.`,
        //           });
        //           return;
        //         }

        //         // Update patient balance (deduct initialCost - the full amount)
        //         const patientPreviousBalance = patient.balance;
        //         patient.PreviousBalance = patientPreviousBalance;
        //         patient.balance = patientBalance - initialCost;

        //         // Update provider balance (add cost - the amount after commission)
        //         const providerPreviousBalance = provider.balance;
        //         provider.PreviousBalance = providerPreviousBalance;
        //         provider.balance = parseFloat(provider.balance) + cost;

        //         // Save both users
        //         await patient.save();
        //         await provider.save();

        //         // Create transaction for patient (withdrawal of initialCost)
        //         const patientTransaction = new Transaction({
        //           userId: patient._id.toString(),
        //           walletID: patient.walletID,
        //           amount: initialCost,
        //           time: new Date(),
        //           referrence: `Consultation Request: ${request._id}`,
        //           type: "withdrawal",
        //           status: "completed",
        //         });
        //         await patientTransaction.save();

        //         // Create transaction for provider (earning of cost, not initialCost)
        //         const providerTransaction = new Transaction({
        //           userId: provider._id.toString(),
        //           walletID: provider.walletID,
        //           amount: cost,
        //           time: new Date(),
        //           referrence: `Consultation Request: ${request._id}`,
        //           type: "earning",
        //           status: "completed",
        //         });
        //         await providerTransaction.save();

        //         // Update request payment status
        //         request.paymentStatus = "paid";
        //         await request.save();
        //       }
        //     }
        //   } else if (
        //     request.paymentMethod === "cash" &&
        //     request.ailmentCategoryId
        //   ) {
        //     // For cash payments, deduct commission from provider's wallet
        //     const commission = parseFloat(request.ailmentCategoryId.commission);
        //     const provider = await User.findById(request.providerId._id);

        //     if (provider && !isNaN(commission) && commission > 0) {
        //       const providerBalance = parseFloat(provider.balance || 0);

        //       // Check balance again (in case it changed since acceptance)
        //       if (providerBalance < commission) {
        //         const shortfall = (commission - providerBalance).toFixed(2);
        //         socket.emit("requestError", {
        //           error: `Unable to complete the consultation. Your wallet balance (N$${providerBalance.toFixed(2)}) is insufficient to cover the commission fee (N$${commission.toFixed(2)}). Please add N$${shortfall} to your wallet to complete this consultation.`,
        //         });
        //         return;
        //       }

        //       // Deduct commission from provider's wallet
        //       const providerPreviousBalance = provider.balance;
        //       provider.PreviousBalance = providerPreviousBalance;
        //       provider.balance = providerBalance - commission;
        //       await provider.save();

        //       // Create transaction record for commission deduction
        //       const commissionTransaction = new Transaction({
        //         userId: provider._id.toString(),
        //         walletID: provider.walletID,
        //         amount: commission,
        //         time: new Date(),
        //         referrence: `Commission for Consultation Request: ${request._id}`,
        //         type: "transfer",
        //         status: "completed",
        //       });
        //       await commissionTransaction.save();

        //       // Update request payment status
        //       request.paymentStatus = "paid";
        //       await request.save();
        //     }
        //   }
        // } catch (paymentError) {
        //   console.error("Payment processing error:", paymentError);
        //   // Don't fail the request completion, but log the error
        //   socket.emit("requestError", {
        //     error: "Payment processing failed. Please contact support.",
        //   });
        // }
      }

      // Notify patient using walletID or _id
      const patientWalletId = request.patientId.walletID;
      const patientId = request.patientId._id.toString();

      let patientSocketId = userSockets.get(patientId);
      if (!patientSocketId && patientWalletId) {
        patientSocketId = userSockets.get(patientWalletId);
      }

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
          body = `${request.providerId.fullname} accepted your teleconsultation. Complete payment to continue.`;
          type = "consultation_payment_pending";
        } else if (status === "paid") {
          title = "Payment Received";
          body = "Your payment was received. Waiting for provider confirmation.";
          type = "consultation_paid";
        } else if (status === "provider_confirmation_pending") {
          title = "Awaiting Provider Confirmation";
          body = "Your payment was received. Waiting for your provider to confirm readiness.";
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

      // Notify provider using walletID or _id
      if (request.providerId) {
        const providerWalletId = request.providerId.walletID;
        const providerId = request.providerId._id.toString();

        let providerSocketId = userSockets.get(providerId);
        if (!providerSocketId && providerWalletId) {
          providerSocketId = userSockets.get(providerWalletId);
        }

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
        const providerWalletId = socket.userId;
        let validProviderId = providerWalletId;
        if (!mongoose.Types.ObjectId.isValid(providerWalletId)) {
          const user = await User.findOne({ walletID: providerWalletId });
          if (user) {
            validProviderId = user._id;
          } else {
            socket.emit("requestError", {
              error:
                "We couldn't find your account information. Please try logging in again or contact support if the issue persists.",
            });
            return;
          }
        } else {
          validProviderId = new mongoose.Types.ObjectId(providerWalletId);
        }

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

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate(
        "providerId",
        "fullname cellphoneNumber role walletID",
      );
      await request.populate("ailmentCategoryId");

      // Notify patient using walletID or _id
      const patientWalletId = request.patientId.walletID;
      const patientId = request.patientId._id.toString();

      let patientSocketId = userSockets.get(patientId);
      if (!patientSocketId && patientWalletId) {
        patientSocketId = userSockets.get(patientWalletId);
      }

      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider if assigned
      if (request.providerId) {
        const providerWalletId = request.providerId.walletID;
        const providerId = request.providerId._id.toString();

        let providerSocketId = userSockets.get(providerId);
        if (!providerSocketId && providerWalletId) {
          providerSocketId = userSockets.get(providerWalletId);
        }

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
          "social worker:": onlineUsers["social worker:"].size,
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
          `Qualification expired for user: ${provider.fullname} (${provider.walletID})`,
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
          `Notification sent to user: ${provider.fullname} (${provider.walletID}) - Expiry: ${provider.hpcnaExpiryDate.toDateString()}`,
        );
      } else {
        console.log(
          `Skipped user: ${provider.fullname} (${provider.walletID}) - Already notified recently`,
        );
      }
    }

    console.log(
      `Task completed. Sent ${notifiedCount} expiry warnings out of ${healthProviders.length} providers with qualifications expiring in 7 days.`,
    );
  } catch (error) {
    console.error("Error checking expiring qualifications:", error);
  }
});

mongoose
  .connect(process.env.MONGO_URI, {})
  .then(() => {
    console.log("MongoDB connected");
    server.listen(process.env.PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
