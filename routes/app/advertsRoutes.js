const { Router } = require('express');
const { getAllAdverts } = require('../../controllers/app/advertsController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');

const appAdvertRouter = Router();

appAdvertRouter.get('/all-adverts',tokenAuthMiddleware,checkUser, getAllAdverts);

module.exports = appAdvertRouter;