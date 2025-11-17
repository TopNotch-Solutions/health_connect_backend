const ConsultationRequest = require("../../models/request");
const User = require("../../models/user");

// This function will be called with the onlineUsers and userSockets from server.js
let getOnlineUsersData = null;
let getUserSocketsData = null;

exports.setSocketData = (onlineUsersFn, userSocketsFn) => {
  getOnlineUsersData = onlineUsersFn;
  getUserSocketsData = userSocketsFn;
};

exports.getRequestStats = async (req, res) => {
  try {
    // Get request statistics
    const totalRequests = await ConsultationRequest.countDocuments();
    const searchingRequests = await ConsultationRequest.countDocuments({ status: "searching" });
    const pendingRequests = await ConsultationRequest.countDocuments({ status: "pending" });
    const acceptedRequests = await ConsultationRequest.countDocuments({ status: "accepted" });
    const enRouteRequests = await ConsultationRequest.countDocuments({ status: "en_route" });
    const arrivedRequests = await ConsultationRequest.countDocuments({ status: "arrived" });
    const inProgressRequests = await ConsultationRequest.countDocuments({ status: "in_progress" });
    const completedRequests = await ConsultationRequest.countDocuments({ status: "completed" });
    const cancelledRequests = await ConsultationRequest.countDocuments({ status: "cancelled" });
    const expiredRequests = await ConsultationRequest.countDocuments({ status: "expired" });
    const rejectedRequests = await ConsultationRequest.countDocuments({ status: "rejected" });

    // Get user statistics
    const totalUsers = await User.countDocuments();
    const totalPatients = await User.countDocuments({ role: "patient" });
    const totalDoctors = await User.countDocuments({ role: "doctor" });
    const totalNurses = await User.countDocuments({ role: "nurse" });
    const totalPhysiotherapists = await User.countDocuments({ role: "physiotherapist" });
    const totalSocialWorkers = await User.countDocuments({ role: "social worker" });
    const totalHealthProviders = totalDoctors + totalNurses + totalPhysiotherapists + totalSocialWorkers;

    // Get socket connection data if available
    let socketData = {
      isConnected: false,
      totalOnline: 0,
      byRole: {
        patient: 0,
        doctor: 0,
        nurse: 0,
        physiotherapist: 0,
        "social worker": 0,
      },
      totalSockets: 0,
    };

    if (getOnlineUsersData && getUserSocketsData) {
      const onlineUsers = getOnlineUsersData();
      const userSockets = getUserSocketsData();
      
      socketData = {
        isConnected: true,
        totalOnline: Object.values(onlineUsers).reduce((sum, users) => sum + users.size, 0),
        byRole: {
          patient: onlineUsers.patient?.size || 0,
          doctor: onlineUsers.doctor?.size || 0,
          nurse: onlineUsers.nurse?.size || 0,
          physiotherapist: onlineUsers.physiotherapist?.size || 0,
          "social worker": onlineUsers["social worker:"]?.size || 0,
        },
        totalSockets: userSockets.size || 0,
      };
    }

    // Get recent requests (last 10)
    const recentRequests = await ConsultationRequest.find()
      .populate("patientId", "fullname cellphoneNumber walletID")
      .populate("providerId", "fullname cellphoneNumber role walletID")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("status urgency createdAt patientId providerId address locationTracking");

    res.status(200).json({
      status: true,
      stats: {
        requests: {
          total: totalRequests,
          searching: searchingRequests,
          pending: pendingRequests,
          accepted: acceptedRequests,
          enRoute: enRouteRequests,
          arrived: arrivedRequests,
          inProgress: inProgressRequests,
          completed: completedRequests,
          cancelled: cancelledRequests,
          expired: expiredRequests,
          rejected: rejectedRequests,
        },
        users: {
          total: totalUsers,
          patients: totalPatients,
          healthProviders: totalHealthProviders,
          doctors: totalDoctors,
          nurses: totalNurses,
          physiotherapists: totalPhysiotherapists,
          socialWorkers: totalSocialWorkers,
        },
        socket: socketData,
        recentRequests: recentRequests,
      },
    });
  } catch (error) {
    console.error("Error fetching request stats:", error);
    res.status(500).json({ 
      status: false,
      message: "We're having trouble processing your request. Please try again shortly.", 
      error: error.message 
    });
  }
};

