/**
 * Resolve medical-aid consultation pricing from ICD-10 record(s).
 *
 * Supports:
 * 1) One ICD record with secondaryICD_10_code + secondaryPrice
 * 2) Two separate ICD records aligned to the same ailment (first + second price)
 *
 * @param {Array<object>|object|null|undefined} icds
 * @returns {{
 *   primary: object,
 *   primaryPrice: number,
 *   secondaryCode: string|null,
 *   secondaryMaf: string|null,
 *   secondaryPrice: number|null,
 *   secondaryIcdId: string|null,
 *   consultationCost: number,
 * }|null}
 */
function resolveMedicalAidIcdPricing(icds) {
  const list = (Array.isArray(icds) ? icds : icds ? [icds] : []).filter(
    Boolean,
  );
  if (!list.length) return null;

  const primary = list[0];
  const primaryPrice = Number(primary.price);
  if (!Number.isFinite(primaryPrice) || primaryPrice < 0) return null;

  // Case A: secondary fields on the same ICD-10 document
  if (
    primary.secondaryICD_10_code &&
    String(primary.secondaryICD_10_code).trim() !== ""
  ) {
    const secondaryPrice =
      primary.secondaryPrice != null &&
      Number.isFinite(Number(primary.secondaryPrice))
        ? Number(primary.secondaryPrice)
        : null;

    return {
      primary,
      primaryPrice,
      secondaryCode: String(primary.secondaryICD_10_code).trim(),
      secondaryMaf: primary.secondaryMAF
        ? String(primary.secondaryMAF).trim()
        : null,
      secondaryPrice,
      secondaryIcdId: null,
      consultationCost:
        primaryPrice + (secondaryPrice != null ? secondaryPrice : 0),
    };
  }

  // Case B: two separate ICD-10 records linked to the ailment
  if (list.length >= 2) {
    const second = list[1];
    const secondaryPrice = Number(second.price);
    if (Number.isFinite(secondaryPrice) && secondaryPrice >= 0) {
      return {
        primary,
        primaryPrice,
        secondaryCode: second.ICD_10_code
          ? String(second.ICD_10_code).trim()
          : null,
        secondaryMaf: second.MAF
          ? String(second.MAF).trim()
          : second.ICD_10_code
            ? String(second.ICD_10_code).trim()
            : null,
        secondaryPrice,
        secondaryIcdId: second._id ? String(second._id) : null,
        consultationCost: primaryPrice + secondaryPrice,
      };
    }
  }

  return {
    primary,
    primaryPrice,
    secondaryCode: null,
    secondaryMaf: null,
    secondaryPrice: null,
    secondaryIcdId: null,
    consultationCost: primaryPrice,
  };
}

module.exports = {
  resolveMedicalAidIcdPricing,
};
