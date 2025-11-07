const { Router } = require('express');
const { createIssue, all } = require('../../controllers/app/issueController');
const uploadIssueImage = require('../../middlewares/uploadIssueImage');

const issueRouter = Router();

issueRouter.post('/create-issue/:id', uploadIssueImage.uploadIssueImage, createIssue);
issueRouter.get('/all-issues/:id', all);

module.exports = issueRouter;