const fs = require("fs");
const path = require("path");
const MedicalAid = require("../../models/medicalAid");
const { emitCatalogUpdated } = require("../../utils/socketIo");

const removeImageFile = (filename) => {
  if (!filename) return;
  const imagePath = path.join("public", "images", path.basename(String(filename)));
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }
};

exports.create = async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || String(title).trim() === "") {
      return res.status(400).json({
        status: "FAILURE",
        message: "Title is required",
      });
    }

    const normalizedTitle = String(title).trim();
    const existing = await MedicalAid.findOne({
      title: {
        $regex: new RegExp(
          `^${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      },
    });
    if (existing) {
      return res.status(400).json({
        status: "FAILURE",
        message: `Medical aid "${normalizedTitle}" already exists`,
      });
    }

    const created = await MedicalAid.create({
      title: normalizedTitle,
      image: null,
    });

    emitCatalogUpdated("medical_aid");

    return res.status(201).json({
      status: "SUCCESS",
      data: created,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.all = async (req, res) => {
  try {
    const items = await MedicalAid.find().sort({ title: 1 });

    return res.status(200).json({
      status: "SUCCESS",
      count: items.length,
      data: items,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.count = async (req, res) => {
  try {
    const count = await MedicalAid.countDocuments();
    return res.status(200).json({
      status: "SUCCESS",
      count,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.get = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await MedicalAid.findById(id);

    if (!item) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Medical aid not found",
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      data: item,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || String(title).trim() === "") {
      return res.status(400).json({
        status: "FAILURE",
        message: "Title is required",
      });
    }

    const normalizedTitle = String(title).trim();
    const duplicate = await MedicalAid.findOne({
      title: {
        $regex: new RegExp(
          `^${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      },
      _id: { $ne: id },
    });
    if (duplicate) {
      return res.status(400).json({
        status: "FAILURE",
        message: `Medical aid "${normalizedTitle}" already exists`,
      });
    }

    const updated = await MedicalAid.findByIdAndUpdate(
      id,
      { title: normalizedTitle },
      { new: true, runValidators: true },
    );

    if (!updated) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Medical aid not found",
      });
    }

    emitCatalogUpdated("medical_aid");

    return res.status(200).json({
      status: "SUCCESS",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.updateImage = async (req, res) => {
  try {
    const { id } = req.params;
    const imagePath = req.file ? req.file.filename : null;

    if (!req.file || !imagePath) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Image is required. Please select an image file to upload.",
      });
    }

    const existing = await MedicalAid.findById(id);
    if (!existing) {
      removeImageFile(imagePath);
      return res.status(404).json({
        status: "FAILURE",
        message: "Medical aid not found",
      });
    }

    if (existing.image) {
      removeImageFile(existing.image);
    }

    existing.image = imagePath;
    await existing.save();

    emitCatalogUpdated("medical_aid");

    return res.status(200).json({
      status: "SUCCESS",
      message: "Medical aid image updated successfully",
      data: existing,
    });
  } catch (error) {
    if (req.file?.filename) {
      removeImageFile(req.file.filename);
    }
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await MedicalAid.findById(id);

    if (!existing) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Medical aid not found",
      });
    }

    if (existing.image) {
      removeImageFile(existing.image);
      existing.image = null;
      await existing.save();
    }

    emitCatalogUpdated("medical_aid");

    return res.status(200).json({
      status: "SUCCESS",
      message: "Medical aid image deleted successfully",
      data: existing,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await MedicalAid.findById(id);

    if (!deleted) {
      return res.status(404).json({
        status: "FAILURE",
        message: "Medical aid not found",
      });
    }

    if (deleted.image) {
      removeImageFile(deleted.image);
    }

    await MedicalAid.findByIdAndDelete(id);

    emitCatalogUpdated("medical_aid");

    return res.status(200).json({
      status: "SUCCESS",
      message: "Medical aid deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};
