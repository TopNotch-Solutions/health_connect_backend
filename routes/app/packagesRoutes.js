const { Router } = require("express");
const { all } = require("../../controllers/app/packageController");


const packagesAppRouter = Router();

packagesAppRouter.get("/all/:provider", all);

module.exports = packagesAppRouter;