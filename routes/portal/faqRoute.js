const { Router } = require('express');
const { create, getAllFAQ, getFAQById, deleteFAQ, updateFAQ } = require('../../controllers/portal/faqController');

const faqPortalRouter = Router();

faqPortalRouter.post('/create-faq', create);
faqPortalRouter.get('/all-faq', getAllFAQ);
faqPortalRouter.get('/faq/:id', getFAQById);
faqPortalRouter.put('/update-faq/:id', updateFAQ);
faqPortalRouter.delete('/delete-faq/:id', deleteFAQ);

module.exports = faqPortalRouter;