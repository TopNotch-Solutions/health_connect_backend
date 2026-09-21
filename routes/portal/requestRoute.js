const { Router } = require('express');
const { getRequestStats, getRequestById } = require('../../controllers/portal/requestController');

const requestPortalRouter = Router();

requestPortalRouter.get('/stats', getRequestStats);
requestPortalRouter.get('/:id', getRequestById);

module.exports = requestPortalRouter;

