const { Router } = require('express');
const { getAllFAQ } = require('../../controllers/app/faqController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');

const faqRouter = Router();

faqRouter.get('/all-faq',tokenAuthMiddleware,checkUser, getAllFAQ);

module.exports = faqRouter;