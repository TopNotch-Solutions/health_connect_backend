const { Router } = require('express');
const { uploadAdverts } = require('../../middlewares/advertUpload');
const { getAllAdverts, create, updateDescription, updateImage, deleteAdvert } = require('../../controllers/portal/advertsController');


const advertsRouter = Router();

advertsRouter.post('/create-adverts', uploadAdverts, create);
advertsRouter.get('/retrieve-all-adverts', getAllAdverts);
advertsRouter.patch('/update-description/:id', updateDescription);
advertsRouter.patch('/update-image/:id', uploadAdverts, updateImage);
advertsRouter.delete('/remove-advert/:id', deleteAdvert);

module.exports = advertsRouter;