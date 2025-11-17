const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [process.env.LOCAL_HOST_1, process.env.LOCAL_HOST_2],
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  },
});

const authRouter = require("./routes/common/authRoute");
const authAppRouter = require("./routes/app/authRoute");
const issueAppRouter = require("./routes/app/issueRoute");
const notificationAppRouter = require("./routes/app/notificationRouter");
const transactionAppRouter = require("./routes/app/transactionRoute");
const specializationAppRouter = require("./routes/app/specializationRoute");
const specializationPortalRouter = require("./routes/portal/specializationRoute");
const aligmentPortalRouter = require("./routes/portal/aligmentRoute");
const faqPortalRouter = require("./routes/portal/faqRoute");
const faqAppRouter = require("./routes/app/faqRoute");
const notificationPortalRouter = require("./routes/portal/notificationRoute");


const authPortalRouter = require("./routes/portal/authController");
const User = require("./models/user");
const ConsultationRequest = require("./models/request");
const AilmentCategory = require("./models/ailment");


app.use(express.static("public"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: [process.env.LOCAL_HOST_1, process.env.LOCAL_HOST_2],
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    credentials: true,
  })
);

app.use("/api/auth", authRouter);
app.use("/api/app/auth", authAppRouter);
app.use("/api/app/issue", issueAppRouter);
app.use("/api/app/notification", notificationAppRouter);
app.use("/api/app/transaction", transactionAppRouter);
app.use("/api/app/specialization", specializationAppRouter);
app.use("/api/portal/specialization", specializationPortalRouter);
app.use("/api/portal/aligment", aligmentPortalRouter);
app.use("/api/portal/faq", faqPortalRouter);
app.use("/api/app/faq", faqAppRouter);
app.use("/api/portal/notification", notificationPortalRouter);

app.use("/api/portal/auth", authPortalRouter);

const onlineUsers = {
  patient: new Set(),
  doctor: new Set(),
  nurse: new Set(),
  physiotherapist: new Set(),
  "social worker:": new Set(),
};

// Store socket IDs by user role and userId for targeted messaging
const userSockets = new Map(); // userId -> socketId

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle user joining with a role
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
        0
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
      
      console.log(`User ${socket.id} joined as ${role}. Total online: ${totalOnline}`);
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
        symptoms,
        preferredTime,
        estimatedCost,
      } = data;

      // Active statuses where a patient is considered to have an ongoing request
      const activePatientStatuses = [
        "searching",
        "pending",
        "accepted",
        "en_route",
        "arrived",
        "in_progress",
      ];

      // Check if patientId is a valid ObjectId, if not, create/find a test user
      let validPatientId = patientId;
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        // Find or create a test user
        let user = await User.findOne({ walletID: patientId });
        if (!user) {
          // Create a test user
          user = new User({
            cellphoneNumber: `test_${Date.now()}`,
            walletID: patientId,
            role: "patient",
            verifiedCellphoneNumber: `test_${Date.now()}`,
            nationalId: `test_${Date.now()}`,
            fullname: `Test User ${patientId.substring(0, 8)}`,
          });
          await user.save();
        }
        validPatientId = user._id; // Use ObjectId directly
      } else {
        // Convert string to ObjectId if it's a valid ObjectId string
        validPatientId = new mongoose.Types.ObjectId(patientId);
      }

      // Enforce single active request per patient
      const existingActive = await ConsultationRequest.findOne({
        patientId: validPatientId,
        status: { $in: activePatientStatuses },
      }).sort({ createdAt: -1 });

      if (existingActive) {
        await existingActive.populate("patientId", "fullname cellphoneNumber walletID");
        await existingActive.populate("ailmentCategoryId");
        
        socket.emit("requestError", {
          error:
            "You already have an active consultation request. Please complete or cancel it before creating a new one.",
          existingRequestId: existingActive._id,
        });
        return;
      }

      const request = new ConsultationRequest({
        patientId: validPatientId,
        ailmentCategoryId,
        urgency: urgency || "medium",
        address,
        symptoms,
        preferredTime,
        estimatedCost,
        status: "searching",
      });

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate("ailmentCategoryId");

      // Notify patient using their walletID
      const patientSocketId = userSockets.get(patientId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestCreated", request);
      }

      // Notify all providers about new available request
      // Only notify providers that are not currently busy
      const providerActiveStatuses = ["accepted", "en_route", "arrived", "in_progress"];
      for (const [socketUserId, socketId] of userSockets.entries()) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (!targetSocket || !targetSocket.role || targetSocket.role === "patient") continue;

        // Find provider by walletID (socketUserId) to determine busy status
        let provider = await User.findOne({ walletID: socketUserId });
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
      
      // Find the actual user ObjectId if patientId is not a valid ObjectId
      let validPatientId = patientId;
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        const user = await User.findOne({ walletID: patientId });
        if (user) {
          validPatientId = user._id; // Use ObjectId directly for queries
        } else {
          socket.emit("patientRequests", []);
          return;
        }
      } else {
        validPatientId = new mongoose.Types.ObjectId(patientId);
      }

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

      // If providerId provided, hide available requests when provider is busy
      if (providerId) {
        let validProviderId = providerId;
        if (!mongoose.Types.ObjectId.isValid(providerId)) {
          const user = await User.findOne({ walletID: providerId });
          if (user) {
            validProviderId = user._id; // Use ObjectId directly for queries
          } else {
            // Provider not found in DB yet; treat as not busy and continue to show 'searching' items
            validProviderId = null;
          }
        } else {
          validProviderId = new mongoose.Types.ObjectId(providerId);
        }
        // Busy if any active consultation
        const providerActiveStatuses = ["accepted", "en_route", "arrived", "in_progress"];
        if (validProviderId) {
          const activeForProvider = await ConsultationRequest.findOne({
            providerId: validProviderId,
            status: { $in: providerActiveStatuses },
          }).select("_id");
          if (activeForProvider) {
            socket.emit("availableRequests", []);
            return;
          }
        }
      }

      // Build availability filter:
      // - Always include 'searching'
      // - Include 'pending' only when addressed to this provider (if providerId known)
      let availabilityFilter = { status: "searching" };
      if (providerId) {
        let pendingForProvider = null;
        if (mongoose.Types.ObjectId.isValid(providerId)) {
          pendingForProvider = new mongoose.Types.ObjectId(providerId);
        } else {
          const user = await User.findOne({ walletID: providerId });
          pendingForProvider = user ? user._id : null;
        }
        // Exclude requests this provider already rejected
        const excludeRejected = pendingForProvider
          ? { rejectedBy: { $ne: pendingForProvider } }
          : {};

        availabilityFilter = {
          $and: [
            excludeRejected,
            {
              $or: [{ status: "searching" }].concat(
                pendingForProvider ? [{ status: "pending", providerId: pendingForProvider }] : []
              ),
            },
          ],
        };
      }

      const requests = await ConsultationRequest.find(availabilityFilter)
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate("ailmentCategoryId")
        .sort({ createdAt: -1 });

      socket.emit("availableRequests", requests);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get ailment categories via socket
  socket.on("getAilmentCategories", async () => {
    try {
      const categories = await AilmentCategory.find().sort({ title: 1 });
      socket.emit("ailmentCategories", categories);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Get requests for provider
  socket.on("getProviderRequests", async (data) => {
    try {
      const { providerId } = data;
      
      // Find the actual user ObjectId if providerId is not a valid ObjectId
      let validProviderId = providerId;
      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        const user = await User.findOne({ walletID: providerId });
        if (user) {
          validProviderId = user._id; // Use ObjectId directly for queries
        } else {
          socket.emit("providerRequests", []);
          return;
        }
      } else {
        validProviderId = new mongoose.Types.ObjectId(providerId);
      }

      const requests = await ConsultationRequest.find({
        providerId: validProviderId,
      })
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate("providerId", "fullname cellphoneNumber role walletID")
        .populate("ailmentCategoryId")
        .sort({ createdAt: -1 });

      socket.emit("providerRequests", requests);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Provider accepts a request
  socket.on("acceptRequest", async (data) => {
    try {
      const { requestId, providerId, estimatedArrival, notes } = data;
      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", { error: "Request not found" });
        return;
      }

      if (request.status !== "searching" && request.status !== "pending") {
        socket.emit("requestError", { error: "Request cannot be accepted" });
        return;
      }

      // Find or create provider user if providerId is not a valid ObjectId
      let validProviderId = providerId;
      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        let user = await User.findOne({ walletID: providerId });
        if (!user) {
          // Create a test provider user
          user = new User({
            cellphoneNumber: `test_${Date.now()}`,
            walletID: providerId,
            role: socket.role || "doctor",
            verifiedCellphoneNumber: `test_${Date.now()}`,
            nationalId: `test_${Date.now()}`,
            fullname: `Test Provider ${providerId.substring(0, 8)}`,
          });
          await user.save();
        }
        validProviderId = user._id; // Use ObjectId directly, not string
      } else {
        // Convert string to ObjectId if it's a valid ObjectId string
        validProviderId = new mongoose.Types.ObjectId(providerId);
      }

      request.status = "accepted";
      request.providerId = validProviderId;
      request.providerResponse = {
        responseTime: new Date(),
        estimatedArrival,
        notes,
      };
      request.timeline.providerAssigned = new Date();

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate("providerId", "fullname cellphoneNumber role walletID");
      await request.populate("ailmentCategoryId");

      // Notify patient - find patient's socket using their walletID
      const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider
      socket.emit("requestUpdated", request);

      // Notify all providers to refresh available requests
      io.emit("requestStatusChanged", { requestId, status: "accepted" });
    } catch (error) {
      socket.emit("requestError", { error: error.message });
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
          const user = await User.findOne({ walletID: providerId }).select("_id");
          rejectingProviderIdObj = user ? user._id : null;
        }
      }
      // Fallback to socket.userId (usually walletID set on join)
      if (!rejectingProviderIdObj && socket.userId) {
        const user = await User.findOne({ walletID: socket.userId }).select("_id");
        rejectingProviderIdObj = user ? user._id : null;
      }

      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate("providerId", "fullname cellphoneNumber role walletID");
      await request.populate("ailmentCategoryId");

      // Behavior depends on current status
      // 1) 'searching': keep the request available to others, but hide it for this provider
      // 2) 'pending': clear providerId and move back to 'searching' (unless no providers remain)
      if (request.status === "searching") {
        if (rejectingProviderIdObj) {
          // Record this provider has rejected so they won't see it again
          if (!request.rejectedBy.some(p => p && p.toString() === rejectingProviderIdObj.toString())) {
            request.rejectedBy.push(rejectingProviderIdObj);
          }
          await request.save();
        }

        // Check if there are any available providers (not busy)
        const providerRoles = ["doctor", "nurse", "physiotherapist", "social worker:"];
        const providerActiveStatuses = ["accepted", "en_route", "arrived", "in_progress"];
        
        // Get all online provider user IDs by checking socket roles
        const onlineProviderWalletIds = [];
        for (const [userId, socketId] of userSockets.entries()) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.role && providerRoles.includes(socket.role)) {
            onlineProviderWalletIds.push(userId);
          }
        }

        // Convert walletIDs to ObjectIds for database query
        const onlineProviderUsers = await User.find({
          walletID: { $in: onlineProviderWalletIds },
        }).select("_id");

        const onlineProviderIds = onlineProviderUsers.map(user => user._id);

        // Check which providers are busy
        const busyProviderIds = onlineProviderIds.length > 0
          ? await ConsultationRequest.distinct("providerId", {
              providerId: { $in: onlineProviderIds },
              status: { $in: providerActiveStatuses },
            })
          : [];

        // Available providers = online providers who are not busy and have not rejected
        const availableProviderIds = onlineProviderIds.filter(
          id =>
            !busyProviderIds.some(busyId => busyId && busyId.toString() === id.toString()) &&
            !request.rejectedBy.some(rid => rid && rid.toString() === id.toString())
        );

        // If no providers are available, notify patient with friendly message
        if (availableProviderIds.length === 0) {
          const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
          const patientSocketId = userSockets.get(patientWalletId);
          if (patientSocketId) {
            io.to(patientSocketId).emit("providerUnavailable", {
              requestId: request._id,
              message: "All our health providers are currently busy. Please try again later or contact support for assistance.",
              ailmentCategory: request.ailmentCategoryId?.title || "your request",
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
          if (!request.rejectedBy.some(p => p && p.toString() === rejectingProviderIdObj.toString())) {
            request.rejectedBy.push(rejectingProviderIdObj);
          }
        }
        request.status = "searching";
        await request.save();
        // Notify rejecting provider to hide
        socket.emit("requestHidden", { requestId: request._id });
        // Notify others there's an available request again
        io.emit("newRequestAvailable", request);
      } else {
        // For other statuses, default to standard update
        socket.emit("requestUpdated", request);
        io.emit("requestStatusChanged", { requestId, status: "rejected" });
      }

      // Notify patient of the updated request (if not already sent above)
      const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
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
      const { requestId, status, notes } = data;
      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", { error: "Request not found" });
        return;
      }

      // Validate status transitions
      const validTransitions = {
        accepted: ["en_route", "cancelled"],
        en_route: ["arrived", "cancelled"],
        arrived: ["in_progress", "cancelled"],
        in_progress: ["completed"],
      };

      if (validTransitions[request.status] && !validTransitions[request.status].includes(status)) {
        socket.emit("requestError", { 
          error: `Invalid status transition from ${request.status} to ${status}` 
        });
        return;
      }

      // Validate provider can only update their own requests
      if (["en_route", "arrived", "in_progress"].includes(status)) {
        const providerWalletId = socket.userId;
        let validProviderId = providerWalletId;
        if (!mongoose.Types.ObjectId.isValid(providerWalletId)) {
          const user = await User.findOne({ walletID: providerWalletId });
          if (user) {
            validProviderId = user._id;
          } else {
            socket.emit("requestError", { error: "Provider not found" });
            return;
          }
        } else {
          validProviderId = new mongoose.Types.ObjectId(providerWalletId);
        }

        if (!request.providerId || request.providerId.toString() !== validProviderId.toString()) {
          socket.emit("requestError", { error: "You are not assigned to this request" });
          return;
        }
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
      await request.populate("providerId", "fullname cellphoneNumber role walletID");
      await request.populate("ailmentCategoryId");

      // Notify patient using walletID
      const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider using walletID
      if (request.providerId) {
        const providerWalletId = request.providerId.walletID || request.providerId._id.toString();
        const providerSocketId = userSockets.get(providerWalletId);
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
        socket.emit("requestError", { error: "Request not found" });
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
            socket.emit("requestError", { error: "Provider not found" });
            return;
          }
        } else {
          validProviderId = new mongoose.Types.ObjectId(providerWalletId);
        }

        // Check if this provider is assigned to this request
        if (!request.providerId || request.providerId.toString() !== validProviderId.toString()) {
          socket.emit("requestError", { error: "You are not assigned to this request" });
          return;
        }

        // Provider can only cancel before arrival
        if (["arrived", "in_progress", "completed"].includes(request.status)) {
          socket.emit("requestError", { error: "Cannot cancel request after arrival" });
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
      await request.populate("providerId", "fullname cellphoneNumber role walletID");
      await request.populate("ailmentCategoryId");

      // Notify patient using walletID
      const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider if assigned
      if (request.providerId) {
        const providerWalletId = request.providerId.walletID || request.providerId._id.toString();
        const providerSocketId = userSockets.get(providerWalletId);
        if (providerSocketId) {
          io.to(providerSocketId).emit("requestUpdated", request);
          
          // If patient cancelled an accepted request, provider is now available
          // Check if the request was in an active status before cancellation
          const wasActiveStatus = ["accepted", "en_route", "arrived", "in_progress"].includes(originalStatus);
          if (cancelledBy === "patient" && wasActiveStatus) {
            // Provider is now available - notify them so they can refresh their available requests
            io.to(providerSocketId).emit("providerAvailable", {
              message: "The consultation was cancelled. You are now available for new consultations.",
            });
          }
        }
      }

      // Notify all providers to remove cancelled request from available requests
      io.emit("requestStatusChanged", { requestId, status: "cancelled" });

      socket.emit("requestUpdated", request);
    } catch (error) {
      socket.emit("requestError", { error: error.message });
    }
  });

  // Submit patient rating
  socket.on("submitRating", async (data) => {
    try {
      const { requestId, stars, feedback } = data;
      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", { error: "Request not found" });
        return;
      }

      // Validate that request is completed
      if (request.status !== "completed") {
        socket.emit("requestError", { error: "Can only rate completed consultations" });
        return;
      }

      // Validate patient is the one rating
      const patientWalletId = socket.userId;
      let validPatientId = patientWalletId;
      if (!mongoose.Types.ObjectId.isValid(patientWalletId)) {
        const user = await User.findOne({ walletID: patientWalletId });
        if (user) {
          validPatientId = user._id;
        } else {
          socket.emit("requestError", { error: "Patient not found" });
          return;
        }
      } else {
        validPatientId = new mongoose.Types.ObjectId(patientWalletId);
      }

      if (request.patientId.toString() !== validPatientId.toString()) {
        socket.emit("requestError", { error: "You can only rate your own requests" });
        return;
      }

      // Validate rating
      if (!stars || stars < 1 || stars > 5) {
        socket.emit("requestError", { error: "Rating must be between 1 and 5 stars" });
        return;
      }

      // Update rating - preserve existing providerRating if it exists
      if (!request.rating) {
        request.rating = {};
      }
      
      request.rating.patientRating = {
        stars,
        feedback: feedback || "",
        createdAt: new Date(),
      };
      
      // Don't touch providerRating if it doesn't exist - Mongoose will handle it

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate("providerId", "fullname cellphoneNumber role walletID");
      await request.populate("ailmentCategoryId");

      // Notify patient
      const patientSocketId = userSockets.get(patientWalletId);
      if (patientSocketId) {
        io.to(patientSocketId).emit("requestUpdated", request);
      }

      // Notify provider
      if (request.providerId) {
        const providerWalletId = request.providerId.walletID || request.providerId._id.toString();
        const providerSocketId = userSockets.get(providerWalletId);
        if (providerSocketId) {
          io.to(providerSocketId).emit("requestUpdated", request);
        }
      }

      socket.emit("ratingSubmitted", { requestId, message: "Rating submitted successfully" });
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
        0
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
      
      console.log(`User ${socket.id} disconnected. Total online: ${totalOnline}`);
    }
  });
});


mongoose
  .connect(process.env.MONGO_URI, {
  })
  .then(() => {
    console.log("MongoDB connected");
    server.listen(process.env.PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });