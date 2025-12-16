const { Router } = require('express');
const { getAllAdverts } = require('../../controllers/app/advertsController');

const appAdvertRouter = Router();

appAdvertRouter.get('/all-adverts', getAllAdverts);

module.exports = appAdvertRouter;