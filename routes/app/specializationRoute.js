const { Router } = require('express');
const { getAllSpecializations } = require('../../controllers/app/specializationController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');

const specializationRouter = Router();

specializationRouter.get('/all-specializations',tokenAuthMiddleware,checkUser, getAllSpecializations);

module.exports = specializationRouter;