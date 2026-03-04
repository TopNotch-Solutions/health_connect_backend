const { Router } = require("express");
const {
  create,
  all,
  get,
  update,
  delete: deletePackage,
} = require("../../controllers/portal/packagesController");

const packagesPortalRouter = Router();

packagesPortalRouter.post("/create", create);

packagesPortalRouter.get("/all", all);

packagesPortalRouter.get("/:id", get);

packagesPortalRouter.put("/update/:id", update);

packagesPortalRouter.delete("/delete/:id", deletePackage);

module.exports = packagesPortalRouter;
