const { Router } = require('express');
const { getAllFAQ } = require('../../controllers/app/faqController');

const faqRouter = Router();

faqRouter.get('/all-faq', getAllFAQ);

module.exports = faqRouter;