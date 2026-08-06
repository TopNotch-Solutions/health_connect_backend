const { Router } = require('express');
const { createIssue, all, getAllIssues } = require('../../controllers/app/issueController');
const uploadIssueImage = require('../../middlewares/uploadIssueImage');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');

const issueRouter = Router();

issueRouter.post('/create-issue',tokenAuthMiddleware,checkUser, uploadIssueImage.uploadIssueImage, createIssue);
issueRouter.get('/all-issues',tokenAuthMiddleware,checkUser, all);
// Removed: a second unauthenticated registration of '/all-issues' (getAllIssues)
// was dead code — Express only ever reached the authenticated route above.

module.exports = issueRouter;