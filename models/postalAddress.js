const mongoose = require("mongoose");

/**
 * Namibian postal address (NamPost / UPU format).
 *
 * Required for all types:
 * - addressee, addressType, postOffice, postcode, country
 *
 * Conditional:
 * - po_box      → boxNumber required; street fields ignored
 * - private_bag → bagNumber required; street fields ignored
 * - street      → premises required; subLocality / locality / unitOrAdditional optional
 *
 * Region is intentionally omitted — Namibia postcodes encode sorting region.
 */
const postalAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
      index: true,
    },
    addressee: {
      type: String,
      required: true,
      trim: true,
    },
    addressType: {
      type: String,
      enum: ["po_box", "private_bag", "street"],
      required: true,
    },
    // PO Box
    boxNumber: {
      type: String,
      required: false,
      trim: true,
    },
    // Private Bag
    bagNumber: {
      type: String,
      required: false,
      trim: true,
    },
    // Physical / street address
    unitOrAdditional: {
      type: String,
      required: false,
      trim: true,
    },
    premises: {
      type: String,
      required: false,
      trim: true,
    },
    subLocality: {
      type: String,
      required: false,
      trim: true,
    },
    locality: {
      type: String,
      required: false,
      trim: true,
    },
    // Delivery post office / postal area name (required)
    postOffice: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    // NamPost 5-digit postcode
    postcode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{5}$/, "Postcode must be exactly 5 digits"],
    },
    country: {
      type: String,
      required: true,
      default: "NAMIBIA",
      uppercase: true,
      trim: true,
    },
  },
  { timestamps: true },
);

postalAddressSchema.pre("validate", function (next) {
  const type = this.addressType;

  if (type === "po_box") {
    if (!String(this.boxNumber || "").trim()) {
      this.invalidate("boxNumber", "PO Box number is required");
    }
  } else if (type === "private_bag") {
    if (!String(this.bagNumber || "").trim()) {
      this.invalidate("bagNumber", "Private Bag number is required");
    }
  } else if (type === "street") {
    if (!String(this.premises || "").trim()) {
      this.invalidate(
        "premises",
        "Street / premises line is required for physical addresses",
      );
    }
  }

  next();
});

/** Format as multi-line Namibian postal address string. */
postalAddressSchema.methods.toFormattedLines = function () {
  const lines = [];
  if (this.addressee) lines.push(String(this.addressee).trim());

  if (this.addressType === "po_box") {
    lines.push(`PO Box ${String(this.boxNumber || "").trim()}`);
  } else if (this.addressType === "private_bag") {
    lines.push(`Private Bag ${String(this.bagNumber || "").trim()}`);
  } else {
    if (this.unitOrAdditional) lines.push(String(this.unitOrAdditional).trim());
    if (this.premises) lines.push(String(this.premises).trim());
    if (this.subLocality) lines.push(String(this.subLocality).trim());
    if (this.locality) lines.push(String(this.locality).trim());
  }

  if (this.postOffice) lines.push(String(this.postOffice).trim().toUpperCase());
  if (this.postcode) lines.push(String(this.postcode).trim());
  lines.push(String(this.country || "NAMIBIA").trim().toUpperCase());
  return lines;
};

postalAddressSchema.methods.toFormattedString = function () {
  return this.toFormattedLines().join("\n");
};

const PostalAddress = mongoose.model("PostalAddress", postalAddressSchema);
module.exports = PostalAddress;
