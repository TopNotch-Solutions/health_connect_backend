const Issue = require("../../models/issue");
const User = require("../../models/user");
const Notification = require("../../models/notification");
const { sendPushToAppUser } = require("../../utils/pushNotifications");

const STORE = {
  pending: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

const TO_PORTAL = {
  Open: "pending",
  "In Progress": "in_progress",
  Closed: "closed",
};

function toPortalIssue(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.portalStatus = TO_PORTAL[o.status] ?? o.status;
  return o;
}

exports.issueCounts = async (req, res) => {
  try {
    const [totalIssues, allPendingIssues, allProgress, allClosed] =
      await Promise.all([
        Issue.countDocuments({}),
        Issue.countDocuments({ status: STORE.pending }),
        Issue.countDocuments({ status: STORE.in_progress }),
        Issue.countDocuments({ status: STORE.closed }),
      ]);

    return res.status(200).json({
      status: "SUCCESS",
      data: {
        totalIssues,
        allPendingIssues,
        allProgress,
        allClosed,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.getAllIssues = async (req, res) => {
  try {
    const issues = await Issue.find()
      .populate("userId", "fullname email cellphoneNumber expoPushToken")
      .sort({ createdAt: -1 });

    const data = issues.map(toPortalIssue);

    return res.status(200).json({
      status: "SUCCESS",
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.updateIssueStatus = async (req, res) => {
  const { id } = req.params;
  const { status: nextPortalStatus } = req.body;

  if (!id) {
    return res.status(400).json({
      status: "FAILURE",
      message: "Issue id is required.",
    });
  }

  const nextStore = STORE[nextPortalStatus];
  if (!nextStore) {
    return res.status(400).json({
      status: "FAILURE",
      message:
        'Invalid status. Use "in_progress" (from pending) or "closed" (from in progress).',
    });
  }

  try {
    const issue = await Issue.findById(id).populate(
      "userId",
      "_id fullname expoPushToken",
    );

    if (!issue) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Issue not found.",
      });
    }

    if (issue.status === STORE.closed) {
      return res.status(400).json({
        status: "FAILURE",
        message: "This issue is closed and cannot be changed.",
      });
    }

    if (issue.status === STORE.pending) {
      if (nextStore !== STORE.in_progress) {
        return res.status(400).json({
          status: "FAILURE",
          message: 'From pending, you can only set status to "in_progress".',
        });
      }
      issue.status = STORE.in_progress;
      await issue.save();

      const userId = issue.userId?._id ?? issue.userId;
      const progressTitle = "Issue in progress";
      const progressMessage = `We're now looking into your report: "${issue.title}".`;
      await Notification.createNotification({
        userId,
        type: "issue_updated",
        title: progressTitle,
        message: progressMessage,
        status: "sent",
        data: { issueId: String(issue._id) },
      });
      const progressPushUser = await User.findById(userId).select(
        "expoPushToken fullname",
      );
      await sendPushToAppUser(
        progressPushUser,
        progressTitle,
        progressMessage,
        { type: "issue_updated", issueId: String(issue._id) },
      );

      return res.status(200).json({
        status: "SUCCESS",
        message: "Issue is now in progress.",
        data: toPortalIssue(issue),
      });
    }

    if (issue.status === STORE.in_progress) {
      if (nextStore !== STORE.closed) {
        return res.status(400).json({
          status: "FAILURE",
          message: 'From in progress, you can only set status to "closed".',
        });
      }

      issue.status = STORE.closed;
      await issue.save();

      const userId = issue.userId?._id ?? issue.userId;
      const title = "Issue resolved";
      const message = `Your reported issue "${issue.title}" has been closed. Thank you for your feedback.`;

      await Notification.createNotification({
        userId,
        type: "issue_resolved",
        title,
        message,
        status: "sent",
        data: {
          issueId: String(issue._id),
          message,
        },
      });

      const pushUser = await User.findById(userId).select(
        "expoPushToken fullname",
      );
      const pushResult = await sendPushToAppUser(
        pushUser,
        title,
        message,
        { type: "issue_resolved", issueId: String(issue._id) },
      );
      const firebasePushSent = Boolean(pushResult);

      return res.status(200).json({
        status: "SUCCESS",
        message: "Issue closed. The client was notified.",
        data: toPortalIssue(issue),
        firebasePushSent,
      });
    }

    return res.status(400).json({
      status: "FAILURE",
      message: "Unexpected issue state.",
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};
