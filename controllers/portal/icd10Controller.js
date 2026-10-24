const mongoose = require("mongoose");
const Icd10 = require("../../models/icd10");

const normalizeObjectIdArray = (value, fieldName) => {
  if (value === undefined) return undefined;
  let arr = value;
  if (typeof arr === "string") {
    try {
      const parsed = JSON.parse(arr);
      arr = Array.isArray(parsed) ? parsed : [arr];
    } catch {
      arr = arr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(arr)) {
    arr = [arr];
  }
  const ids = arr
    .map((item) => {
      if (item && typeof item === "object" && item._id) return String(item._id);
      return String(item);
    })
    .filter(Boolean);

  if (ids.length === 0) {
    return { error: `At least one ${fieldName} is required.` };
  }
  if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
    return { error: `Invalid ${fieldName} id provided.` };
  }
  return { ids };
};

/**
 * Optional second ICD-10 + price. Both must be set together, or both cleared.
 * Returns { secondaryICD_10_code, secondaryPrice } or { error }.
 */
const normalizeSecondaryIcd = (
  secondaryICD_10_code,
  secondaryPrice,
  primaryCode,
) => {
  const hasCode =
    secondaryICD_10_code !== undefined &&
    secondaryICD_10_code !== null &&
    String(secondaryICD_10_code).trim() !== "";
  const priceRaw = secondaryPrice;
  const hasPriceInput =
    priceRaw !== undefined &&
    priceRaw !== null &&
    String(priceRaw).trim() !== "";

  if (!hasCode && !hasPriceInput) {
    return { secondaryICD_10_code: null, secondaryPrice: null };
  }

  if (hasCode !== hasPriceInput) {
    return {
      error:
        "Second ICD-10 code and second price must both be provided, or both left empty.",
    };
  }

  const code = String(secondaryICD_10_code).trim().toUpperCase();
  if (primaryCode && code === String(primaryCode).trim().toUpperCase()) {
    return {
      error: "Second ICD-10 code must be different from the primary ICD-10 code.",
    };
  }

  const parsed = parseFloat(priceRaw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      error: "Second price must be a non-negative number",
    };
  }

  return { secondaryICD_10_code: code, secondaryPrice: parsed };
};

exports.create = async (req, res) => {
  try {
    const {
      ICD_10_code,
      MAF,
      price,
      secondaryICD_10_code,
      secondaryPrice,
      specializations,
      alignments,
    } = req.body;

    if (!ICD_10_code || String(ICD_10_code).trim() === "") {
      return res.status(400).json({
        status: "FAILURE",
        message: "ICD-10 code is required",
      });
    }

    if (!MAF || String(MAF).trim() === "") {
      return res.status(400).json({
        status: "FAILURE",
        message: "MAF is required",
      });
    }

    const parsedPrice = parseFloat(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        status: "FAILURE",
        message: "Price is required and must be a non-negative number",
      });
    }

    const code = String(ICD_10_code).trim().toUpperCase();
    const secondary = normalizeSecondaryIcd(
      secondaryICD_10_code,
      secondaryPrice,
      code,
    );
    if (secondary.error) {
      return res.status(400).json({
        status: "FAILURE",
        message: secondary.error,
      });
    }

    const specs = normalizeObjectIdArray(specializations, "specialization");
    if (specs.error) {
      return res.status(400).json({ status: "FAILURE", message: specs.error });
    }

    const aligns = normalizeObjectIdArray(alignments, "alignment");
    if (aligns.error) {
      return res.status(400).json({ status: "FAILURE", message: aligns.error });
    }

    const maf = String(MAF).trim().toUpperCase();
    const existing = await Icd10.findOne({ ICD_10_code: code });
    if (existing) {
      return res.status(400).json({
        status: "FAILURE",
        message: `ICD-10 code ${code} already exists`,
      });
    }

    const created = await Icd10.create({
      ICD_10_code: code,
      MAF: maf,
      price: parsedPrice,
      secondaryICD_10_code: secondary.secondaryICD_10_code,
      secondaryPrice: secondary.secondaryPrice,
      specializations: specs.ids,
      alignments: aligns.ids,
    });

    const populated = await Icd10.findById(created._id)
      .populate("specializations", "title")
      .populate("alignments", "title");

    return res.status(201).json({
      status: "SUCCESS",
      data: populated,
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
    const items = await Icd10.find()
      .populate("specializations", "title")
      .populate("alignments", "title")
      .sort({ createdAt: -1 });

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
    const count = await Icd10.countDocuments();
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
    const item = await Icd10.findById(id)
      .populate("specializations", "title")
      .populate("alignments", "title");

    if (!item) {
      return res.status(404).json({
        status: "FAILURE",
        message: "ICD-10 code not found",
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
    const {
      ICD_10_code,
      MAF,
      price,
      secondaryICD_10_code,
      secondaryPrice,
      specializations,
      alignments,
    } = req.body;

    const item = await Icd10.findById(id);
    if (!item) {
      return res.status(404).json({
        status: "FAILURE",
        message: "ICD-10 code not found",
      });
    }

    if (ICD_10_code !== undefined) {
      const code = String(ICD_10_code).trim().toUpperCase();
      if (!code) {
        return res.status(400).json({
          status: "FAILURE",
          message: "ICD-10 code cannot be empty",
        });
      }
      const duplicate = await Icd10.findOne({
        ICD_10_code: code,
        _id: { $ne: id },
      });
      if (duplicate) {
        return res.status(400).json({
          status: "FAILURE",
          message: `ICD-10 code ${code} already exists`,
        });
      }
      item.ICD_10_code = code;
    }

    if (MAF !== undefined) {
      const maf = String(MAF).trim().toUpperCase();
      if (!maf) {
        return res.status(400).json({
          status: "FAILURE",
          message: "MAF cannot be empty",
        });
      }
      item.MAF = maf;
    }

    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({
          status: "FAILURE",
          message: "Price must be a non-negative number",
        });
      }
      item.price = parsedPrice;
    }

    if (secondaryICD_10_code !== undefined || secondaryPrice !== undefined) {
      const secondary = normalizeSecondaryIcd(
        secondaryICD_10_code !== undefined
          ? secondaryICD_10_code
          : item.secondaryICD_10_code,
        secondaryPrice !== undefined ? secondaryPrice : item.secondaryPrice,
        item.ICD_10_code,
      );
      if (secondary.error) {
        return res.status(400).json({
          status: "FAILURE",
          message: secondary.error,
        });
      }
      item.secondaryICD_10_code = secondary.secondaryICD_10_code;
      item.secondaryPrice = secondary.secondaryPrice;
    }

    if (specializations !== undefined) {
      const specs = normalizeObjectIdArray(specializations, "specialization");
      if (specs.error) {
        return res.status(400).json({ status: "FAILURE", message: specs.error });
      }
      item.specializations = specs.ids;
    }

    if (alignments !== undefined) {
      const aligns = normalizeObjectIdArray(alignments, "alignment");
      if (aligns.error) {
        return res.status(400).json({ status: "FAILURE", message: aligns.error });
      }
      item.alignments = aligns.ids;
    }

    await item.save();

    const populated = await Icd10.findById(item._id)
      .populate("specializations", "title")
      .populate("alignments", "title");

    return res.status(200).json({
      status: "SUCCESS",
      data: populated,
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
    const item = await Icd10.findByIdAndDelete(id);

    if (!item) {
      return res.status(404).json({
        status: "FAILURE",
        message: "ICD-10 code not found",
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      message: "ICD-10 code deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};
