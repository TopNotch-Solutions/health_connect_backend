const { Router } = require('express');
const { create, getAilmentById, updateAilment, deleteAilment, getAllAilments, updateAilmentImage } = require('../../controllers/portal/alignmentController');
const { uploadAilment } = require('../../middlewares/ailmentUpload');

const aligmentPortalRouter = Router();

aligmentPortalRouter.post('/create-alignment', uploadAilment, create);
aligmentPortalRouter.get('/all-alignments', getAllAilments);
aligmentPortalRouter.get('/alignment/:id', getAilmentById);
aligmentPortalRouter.put('/update-alignment/:id', updateAilment);
aligmentPortalRouter.put('/update-ailment-image/:id',uploadAilment, updateAilmentImage);
aligmentPortalRouter.delete('/delete-alignment/:id', deleteAilment);

module.exports = aligmentPortalRouter;