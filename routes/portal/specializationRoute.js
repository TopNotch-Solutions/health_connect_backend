const { Router } = require('express');
const { create, getAllSpecializations, getSpecializationById, updateSpecialization, deleteSpecialization } = require('../../controllers/portal/specializationController');

const specializationPortalRouter = Router();

specializationPortalRouter.post("/add-new-specialization", create);
specializationPortalRouter.get('/all-specializations', getAllSpecializations);
specializationPortalRouter.get('/specialization/:id', getSpecializationById);
specializationPortalRouter.put('/update-specialization/:id', updateSpecialization);
specializationPortalRouter.delete('/delete-specialization/:id', deleteSpecialization);

module.exports = specializationPortalRouter;