const { Router } = require('express');
const { getRequestStats } = require('../../controllers/portal/requestController');

const requestPortalRouter = Router();

requestPortalRouter.get('/stats', getRequestStats);

module.exports = requestPortalRouter;

