const { Router } = require('express');
const { getAllSpecializations } = require('../../controllers/app/specializationController');
const { tokenAuthMiddleware, checkUser, appTokenMiddleware, checkAppUser } = require('../../middlewares/authMiddleware');

const specializationRouter = Router();

specializationRouter.get('/all-specializations',appTokenMiddleware, checkAppUser, getAllSpecializations);

module.exports = specializationRouter;