const { Router } = require("express");
const {
  create,
  all,
  count,
  get,
  update,
  delete: deleteIcd10,
} = require("../../controllers/portal/icd10Controller");

const icd10PortalRouter = Router();

icd10PortalRouter.post("/create", create);
icd10PortalRouter.get("/all", all);
icd10PortalRouter.get("/count", count);
icd10PortalRouter.get("/:id", get);
icd10PortalRouter.put("/update/:id", update);
icd10PortalRouter.delete("/delete/:id", deleteIcd10);

module.exports = icd10PortalRouter;
