/**
 * Validate and normalise a Namibian postal address payload.
 * Returns { ok: true, data } or { ok: false, error }.
 */
function validateNamibianPostalAddress(input = {}, { requireAddressee = true } = {}) {
  const addressee = String(input.addressee || "").trim();
  const addressType = String(input.addressType || "").trim().toLowerCase();
  const boxNumber = String(input.boxNumber || "").trim();
  const bagNumber = String(input.bagNumber || "").trim();
  const unitOrAdditional = String(input.unitOrAdditional || "").trim();
  const premises = String(input.premises || "").trim();
  const subLocality = String(input.subLocality || "").trim();
  const locality = String(input.locality || "").trim();
  const postOffice = String(input.postOffice || "").trim().toUpperCase();
  const postcode = String(input.postcode || "").trim();
  const country = String(input.country || "NAMIBIA").trim().toUpperCase() || "NAMIBIA";

  const allowedTypes = ["po_box", "private_bag", "street"];
  if (!allowedTypes.includes(addressType)) {
    return {
      ok: false,
      error:
        "Please select an address type: PO Box, Private Bag, or Street address.",
    };
  }

  if (requireAddressee && !addressee) {
    return { ok: false, error: "Addressee name is required." };
  }

  if (!postOffice) {
    return {
      ok: false,
      error: "Delivery post office / postal area is required.",
    };
  }

  if (!/^\d{5}$/.test(postcode)) {
    return {
      ok: false,
      error: "Postcode must be exactly 5 digits (NamPost format).",
    };
  }

  if (country !== "NAMIBIA") {
    return { ok: false, error: "Country must be NAMIBIA." };
  }

  if (addressType === "po_box" && !boxNumber) {
    return { ok: false, error: "PO Box number is required." };
  }

  if (addressType === "private_bag" && !bagNumber) {
    return { ok: false, error: "Private Bag number is required." };
  }

  if (addressType === "street" && !premises) {
    return {
      ok: false,
      error: "Street / premises line is required for physical addresses.",
    };
  }

  const data = {
    addressee: addressee || undefined,
    addressType,
    boxNumber: addressType === "po_box" ? boxNumber : undefined,
    bagNumber: addressType === "private_bag" ? bagNumber : undefined,
    unitOrAdditional:
      addressType === "street" && unitOrAdditional
        ? unitOrAdditional
        : undefined,
    premises: addressType === "street" ? premises : undefined,
    subLocality:
      addressType === "street" && subLocality ? subLocality : undefined,
    locality: addressType === "street" && locality ? locality : undefined,
    postOffice,
    postcode,
    country,
  };

  return { ok: true, data };
}

function formatPostalAddressLines(addr = {}) {
  const lines = [];
  if (addr.addressee) lines.push(String(addr.addressee).trim());

  if (addr.addressType === "po_box") {
    lines.push(`PO Box ${String(addr.boxNumber || "").trim()}`);
  } else if (addr.addressType === "private_bag") {
    lines.push(`Private Bag ${String(addr.bagNumber || "").trim()}`);
  } else if (addr.addressType === "street") {
    if (addr.unitOrAdditional) lines.push(String(addr.unitOrAdditional).trim());
    if (addr.premises) lines.push(String(addr.premises).trim());
    if (addr.subLocality) lines.push(String(addr.subLocality).trim());
    if (addr.locality) lines.push(String(addr.locality).trim());
  }

  if (addr.postOffice) lines.push(String(addr.postOffice).trim().toUpperCase());
  if (addr.postcode) lines.push(String(addr.postcode).trim());
  lines.push(String(addr.country || "NAMIBIA").trim().toUpperCase());
  return lines.filter(Boolean);
}

function formatPostalAddressString(addr) {
  return formatPostalAddressLines(addr).join("\n");
}

module.exports = {
  validateNamibianPostalAddress,
  formatPostalAddressLines,
  formatPostalAddressString,
};
