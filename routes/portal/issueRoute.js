const { Router } = require("express");
const {
  issueCounts,
  getAllIssues,
  updateIssueStatus,
} = require("../../controllers/portal/issueController");

const issuePortalRouter = Router();

issuePortalRouter.get("/counts", issueCounts);
issuePortalRouter.get("/all", getAllIssues);
issuePortalRouter.patch("/update-status/:id", updateIssueStatus);

module.exports = issuePortalRouter;
