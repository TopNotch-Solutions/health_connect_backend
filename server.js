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
    origin: "*",
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
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
const requestPortalRouter = require("./routes/portal/requestRoute");
const { setSocketData } = require("./controllers/portal/requestController");
const User = require("./models/user");
const ConsultationRequest = require("./models/request");
const AilmentCategory = require("./models/ailment");
const Transaction = require("./models/transaction");


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
app.use("/api/portal/request", requestPortalRouter);

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
  () => userSockets
);

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
        paymentMethod,
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

      // Check wallet balance if payment method is wallet
      if (paymentMethod === "wallet") {
        const patient = await User.findById(validPatientId);
        if (!patient) {
          socket.emit("requestError", { error: "Patient not found" });
          return;
        }

        const cost = parseFloat(estimatedCost);
        if (isNaN(cost) || cost <= 0) {
          socket.emit("requestError", { 
            error: "Invalid cost. Please provide a valid amount." 
          });
          return;
        }

        if (patient.balance < cost) {
          socket.emit("requestError", {
            error: `Insufficient wallet balance. Your current balance is ${patient.balance.toFixed(2)}, but the consultation cost is ${cost.toFixed(2)}. Please add funds to your wallet or select Cash payment method.`,
          });
          return;
        }
      }

      const request = new ConsultationRequest({
        patientId: validPatientId,
        ailmentCategoryId,
        urgency: urgency || "medium",
        address,
        symptoms,
        preferredTime,
        estimatedCost,
        paymentMethod: paymentMethod || "wallet",
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
      console.log('🔍 getAvailableRequests handler - providerId:', providerId);

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
        console.log('🔍 Converted providerId to:', validProviderId);
        
        // Busy if any active consultation
        const providerActiveStatuses = ["accepted", "en_route", "arrived", "in_progress"];
        if (validProviderId) {
          const activeForProvider = await ConsultationRequest.findOne({
            providerId: validProviderId,
            status: { $in: providerActiveStatuses },
          }).select("_id");
          if (activeForProvider) {
            console.log('⚠️ Provider is busy with request:', activeForProvider._id);
            socket.emit("availableRequests", []);
            return;
          }
        }
      }

      // Simplified query: Just show requests with status "searching"
      // Providers will see requests that haven't been claimed yet
      const availabilityFilter = { status: "searching" };
      
      console.log('🔍 Executing query with simplified filter:', JSON.stringify(availabilityFilter, null, 2));
      const requests = await ConsultationRequest.find(availabilityFilter)
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate("ailmentCategoryId")
        .sort({ createdAt: -1 });

      console.log('✅ Found requests count:', requests.length);
      console.log('✅ Requests IDs:', requests.map(r => r._id));
      if (requests.length > 0) {
        console.log('✅ First request:', JSON.stringify(requests[0], null, 2));
      }
      socket.emit("availableRequests", requests);
    } catch (error) {
      console.error('❌ getAvailableRequests error:', error);
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

      if (!providerLocation || !providerLocation.latitude || !providerLocation.longitude) {
        socket.emit("requestError", { 
          error: "Provider location (latitude and longitude) is required" 
        });
        return;
      }

      const request = await ConsultationRequest.findById(requestId);

      if (!request) {
        socket.emit("requestError", { error: "Request not found" });
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
      request.markModified('locationTracking');

      await request.save();
      await request.populate("patientId", "fullname cellphoneNumber walletID");
      await request.populate("providerId", "fullname cellphoneNumber role walletID");
      await request.populate("ailmentCategoryId");

      // Notify patient
      const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
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
      console.log('🔍 getProviderRequests handler - providerId:', providerId);
      
      // Find the actual user ObjectId if providerId is not a valid ObjectId
      let validProviderId = providerId;
      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        const user = await User.findOne({ walletID: providerId });
        if (user) {
          validProviderId = user._id; // Use ObjectId directly for queries
          console.log('🔍 Converted walletID to ObjectId:', validProviderId);
        } else {
          console.log('⚠️ Provider not found in DB with walletID:', providerId);
          socket.emit("providerRequests", []);
          return;
        }
      } else {
        validProviderId = new mongoose.Types.ObjectId(providerId);
        console.log('🔍 Converted string ObjectId to:', validProviderId);
      }

      const requests = await ConsultationRequest.find({
        providerId: validProviderId,
      })
        .populate("patientId", "fullname cellphoneNumber walletID")
        .populate("providerId", "fullname cellphoneNumber role walletID")
        .populate("ailmentCategoryId")
        .sort({ createdAt: -1 });

      console.log('✅ Found provider requests count:', requests.length);
      console.log('✅ Provider requests IDs:', requests.map(r => r._id));
      if (requests.length > 0) {
        console.log('✅ First provider request:', JSON.stringify(requests[0], null, 2));
      }

      socket.emit("providerRequests", requests);
    } catch (error) {
      console.error('❌ getProviderRequests error:', error);
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
        console.error('❌ Invalid ObjectId format:', requestId);
        if (callback) callback(null);
        return;
      }

      const request = await ConsultationRequest.findById(objectId);
      
      if (!request) {
        console.log('❌ Request not found for getProviderLocation:', requestId);
        if (callback) callback(null);
        return;
      }

      console.log('📍 Request location tracking:', request.locationTracking);
      console.log('📍 Request status:', request.status);
      
      // Return provider location if available
      if (request.locationTracking && request.locationTracking.providerLocation) {
        console.log('✅ Sending provider location from tracking:', request.locationTracking.providerLocation);
        if (callback) callback(request.locationTracking.providerLocation);
      } else {
        console.log('⚠️ No location tracking data for request - provider may not have started route yet');
        if (callback) callback(null);
      }
    } catch (error) {
      console.error('❌ getProviderLocation error:', error);
      if (callback) callback(null);
    }
  });

  // Update provider location in real-time for a specific request
  socket.on("updateProviderLocationRealtime", async (data) => {
    try {
      console.log('🔔 Received updateProviderLocationRealtime event');
      console.log('📊 Event data:', JSON.stringify(data));
      
      const { requestId, location } = data;
      console.log('📊 requestId:', requestId, 'location:', location);
      
      if (!requestId || !location) {
        console.log('⚠️ Missing requestId or location in updateProviderLocationRealtime');
        console.log('📊 requestId truthy:', !!requestId, 'location truthy:', !!location);
        return;
      }

      // Convert string ID to ObjectId
      let objectId;
      try {
        objectId = new mongoose.Types.ObjectId(requestId);
        console.log('✅ Converted to ObjectId:', objectId);
      } catch (err) {
        console.error('❌ Invalid ObjectId format:', requestId);
        return;
      }

      const request = await ConsultationRequest.findById(objectId);
      console.log('📊 Request found:', !!request);
      
      if (!request) {
        console.log('❌ Request not found for updateProviderLocationRealtime:', requestId);
        return;
      }

      console.log('📍 Updating location for request:', requestId);
      
      // Update provider location in database
      if (!request.locationTracking) {
        request.locationTracking = {};
      }
      
      request.locationTracking.providerLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        lastUpdated: new Date(),
      };
      
      request.markModified('locationTracking');
      await request.save();
      console.log('✅ Location saved to database');

      // Broadcast location update to patient
      const patientWalletId = request.patientId.walletID || request.patientId._id.toString();
      const patientSocketId = userSockets.get(patientWalletId);
      
      console.log('📊 Patient walletId:', patientWalletId, 'socketId:', patientSocketId);
      
      if (patientSocketId) {
        console.log('📍 Broadcasting provider location to patient:', { requestId, location });
        io.to(patientSocketId).emit("updateProviderLocation", {
          requestId,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: new Date(),
          }
        });
      } else {
        console.log('⚠️ Patient socket not found, location saved but not broadcasted');
      }
    } catch (error) {
      console.error('❌ updateProviderLocationRealtime error:', error);
      console.error('❌ Error stack:', error.stack);
    }
  });

  // Provider accepts a request
  socket.on("acceptRequest", async (data) => {
    try {
      const { requestId, providerId } = data;
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
      const { requestId, status, notes, providerLocation } = data;
      console.log('📤 Received updateRequestStatus:', { requestId, status, hasLocation: !!providerLocation });
      console.log('📤 RequestId type:', typeof requestId, 'Value:', requestId);
      
      // Convert string ID to ObjectId
      let objectId;
      try {
        objectId = new mongoose.Types.ObjectId(requestId);
        console.log('✅ Converted to ObjectId:', objectId);
      } catch (err) {
        console.error('❌ Invalid ObjectId format:', requestId);
        socket.emit("requestError", { error: "Invalid request ID format" });
        return;
      }
      
      // Debug: Check all requests in database
      const allRequests = await ConsultationRequest.find({}).select('_id status').limit(5);
      console.log('📊 All requests in database (first 5):', allRequests.map(r => ({ id: r._id.toString(), status: r.status })));
      console.log('📊 Total requests in database:', await ConsultationRequest.countDocuments());
      
      const request = await ConsultationRequest.findById(objectId);
      console.log('🔍 Database lookup result:', request ? '✅ Found' : '❌ Not found');
      
      if (!request) {
        console.error('❌ Request not found in database for ID:', requestId);
        socket.emit("requestError", { error: "Request not found" });
        return;
      }

      // Validate status transitions
      const validTransitions = {
        accepted: ["en_route", "cancelled"],
        en_route: ["arrived", "cancelled"],
        arrived: ["in_progress", "completed", "cancelled"],
        in_progress: ["completed", "cancelled"],
      };

      if (validTransitions[request.status] && !validTransitions[request.status].includes(status)) {
        socket.emit("requestError", { 
          error: `Invalid status transition from ${request.status} to ${status}` 
        });
        return;
      }

      // Validate provider can only update their own requests
      if (["en_route", "arrived", "in_progress", "completed"].includes(status)) {
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

      // Update provider location when status is en_route
      if (status === "en_route") {
        if (!providerLocation || !providerLocation.latitude || !providerLocation.longitude) {
          socket.emit("requestError", { 
            error: "Provider location (latitude and longitude) is required when going en_route" 
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
        request.markModified('locationTracking');
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

      // Process wallet payment when consultation is completed
      if (status === "completed" && request.paymentMethod === "wallet") {
        try {
          // Get the cost (use finalCost if available, otherwise estimatedCost)
          const cost = request.finalCost 
            ? parseFloat(request.finalCost) 
            : parseFloat(request.estimatedCost);

          if (!isNaN(cost) && cost > 0) {
            // Get patient and provider
            const patient = await User.findById(request.patientId._id);
            const provider = await User.findById(request.providerId._id);

            if (patient && provider) {
              // Update patient balance (deduct)
              const patientPreviousBalance = patient.balance;
              patient.PreviousBalance = patientPreviousBalance;
              patient.balance = patient.balance - cost;

              // Update provider balance (add)
              const providerPreviousBalance = provider.balance;
              provider.PreviousBalance = providerPreviousBalance;
              provider.balance = provider.balance + cost;

              // Save both users
              await patient.save();
              await provider.save();

              // Create transaction for patient (withdrawal)
              const patientTransaction = new Transaction({
                userId: patient._id.toString(),
                walletID: patient.walletID,
                amount: cost,
                time: new Date(),
                referrence: `Consultation Request: ${request._id}`,
                type: "withdrawal",
                status: "completed",
              });
              await patientTransaction.save();

              // Create transaction for provider (earning)
              const providerTransaction = new Transaction({
                userId: provider._id.toString(),
                walletID: provider.walletID,
                amount: cost,
                time: new Date(),
                referrence: `Consultation Request: ${request._id}`,
                type: "earning",
                status: "completed",
              });
              await providerTransaction.save();

              // Update request payment status
              request.paymentStatus = "paid";
              await request.save();
            }
          }
        } catch (paymentError) {
          console.error("Payment processing error:", paymentError);
          // Don't fail the request completion, but log the error
          socket.emit("requestError", { 
            error: "Payment processing failed. Please contact support." 
          });
        }
      }

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