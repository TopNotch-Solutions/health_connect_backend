const { Router } = require('express');
const { create, getAilmentById, updateAilment, deleteAilment, getAllAilments } = require('../../controllers/portal/alignmentController');

const aligmentPortalRouter = Router();

aligmentPortalRouter.post('/create-alignment', create);
aligmentPortalRouter.get('/all-alignments', getAllAilments);
aligmentPortalRouter.get('/alignment/:id', getAilmentById);
aligmentPortalRouter.put('/update-alignment/:id', updateAilment);
aligmentPortalRouter.delete('/delete-alignment/:id', deleteAilment);

module.exports = aligmentPortalRouter;