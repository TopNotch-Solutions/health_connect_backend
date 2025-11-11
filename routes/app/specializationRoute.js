const { Router } = require('express');
const { getAllSpecializations } = require('../../controllers/app/specializationController');

const specializationRouter = Router();

specializationRouter.get('/all-specializations', getAllSpecializations);

module.exports = specializationRouter;