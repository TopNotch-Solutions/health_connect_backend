const PostalAddress = require("../../models/postalAddress");
const {
  validateNamibianPostalAddress,
  formatPostalAddressString,
} = require("../../utils/postalAddressValidation");

function serialize(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    userId: String(obj.userId),
    addressee: obj.addressee || "",
    addressType: obj.addressType,
    boxNumber: obj.boxNumber || "",
    bagNumber: obj.bagNumber || "",
    unitOrAdditional: obj.unitOrAdditional || "",
    premises: obj.premises || "",
    subLocality: obj.subLocality || "",
    locality: obj.locality || "",
    postOffice: obj.postOffice || "",
    postcode: obj.postcode || "",
    country: obj.country || "NAMIBIA",
    formatted: formatPostalAddressString(obj),
    updatedAt: obj.updatedAt,
    createdAt: obj.createdAt,
  };
}

/** GET /api/app/postal-address — current patient's saved postal address */
exports.getMine = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: "ERROR",
        message: "Authentication required.",
      });
    }

    const doc = await PostalAddress.findOne({ userId });
    return res.status(200).json({
      status: "SUCCESS",
      data: serialize(doc),
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};

/** PUT /api/app/postal-address — create or update patient's postal address */
exports.upsertMine = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: "ERROR",
        message: "Authentication required.",
      });
    }

    const validation = validateNamibianPostalAddress(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({
        status: "ERROR",
        message: validation.error,
      });
    }

    const doc = await PostalAddress.findOneAndUpdate(
      { userId },
      {
        userId,
        ...validation.data,
        // Clear unused type-specific fields on switch
        boxNumber: validation.data.boxNumber || null,
        bagNumber: validation.data.bagNumber || null,
        unitOrAdditional: validation.data.unitOrAdditional || null,
        premises: validation.data.premises || null,
        subLocality: validation.data.subLocality || null,
        locality: validation.data.locality || null,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      status: "SUCCESS",
      message: "Postal address saved.",
      data: serialize(doc),
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const first = Object.values(error.errors || {})[0];
      return res.status(400).json({
        status: "ERROR",
        message: first?.message || "Invalid postal address.",
      });
    }
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
};
