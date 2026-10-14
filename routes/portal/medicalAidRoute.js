const { Router } = require("express");
const {
  create,
  all,
  count,
  get,
  update,
  updateImage,
  deleteImage,
  delete: deleteMedicalAid,
} = require("../../controllers/portal/medicalAidController");
const {
  uploadMedicalAidImage,
} = require("../../middlewares/uploadMedicalAidImage");

const medicalAidPortalRouter = Router();

const handleMulterError = (err, req, res, next) => {
  if (err) {
    console.error("Medical aid image upload error:", err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        status: "FAILURE",
        message: "File size is too large. Please upload an image smaller than 5MB.",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        status: "FAILURE",
        message: 'Unexpected file field. Please use "image" as the field name.',
      });
    }
    return res.status(400).json({
      status: "FAILURE",
      message: err.message || "File upload error occurred.",
    });
  }
  next();
};

medicalAidPortalRouter.post("/create", create);
medicalAidPortalRouter.get("/all", all);
medicalAidPortalRouter.get("/count", count);
medicalAidPortalRouter.get("/:id", get);
medicalAidPortalRouter.put("/update/:id", update);
medicalAidPortalRouter.patch(
  "/upload-image/:id",
  uploadMedicalAidImage,
  handleMulterError,
  updateImage,
);
medicalAidPortalRouter.delete("/delete-image/:id", deleteImage);
medicalAidPortalRouter.delete("/delete/:id", deleteMedicalAid);

module.exports = medicalAidPortalRouter;
