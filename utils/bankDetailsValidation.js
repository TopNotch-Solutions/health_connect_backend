/**
 * Mask a bank-details value for display: first 2 + last 2 characters,
 * middle as * (one asterisk per missing character).
 * Full values stay in the DB for medical aid claim PDFs.
 */
function maskBankField(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) {
    return "*".repeat(text.length);
  }
  const first = text.slice(0, 2);
  const last = text.slice(-2);
  const middle = "*".repeat(text.length - 4);
  return `${first}${middle}${last}`;
}

/** @deprecated use maskBankField — kept for callers that still import this name */
function maskAccountNumber(value) {
  return maskBankField(String(value || "").replace(/\D/g, "") || value);
}

function isMaskedBankField(value) {
  return /\*/.test(String(value || ""));
}

function isMaskedAccountNumber(value) {
  return isMaskedBankField(value);
}

/**
 * Validate and normalise provider practice bank details.
 * Returns { ok: true, data } or { ok: false, error }.
 * Pass `existing` when the client may send masked values to keep.
 */
function validateBankDetails(input = {}, { existing } = {}) {
  const existingDoc = existing || {};

  const resolveField = (key, { required = true, normalize } = {}) => {
    let value = String(input[key] || "").trim();
    if (isMaskedBankField(value)) {
      const kept = String(existingDoc[key] || "").trim();
      if (!kept) {
        return {
          error: `Enter the full ${key.replace(/([A-Z])/g, " $1").toLowerCase()}.`,
        };
      }
      value = kept;
    }
    if (normalize) value = normalize(value);
    if (required && !value) {
      return {
        error: `${key.replace(/([A-Z])/g, " $1")} is required.`.replace(
          /^./,
          (c) => c.toUpperCase(),
        ),
      };
    }
    return { value };
  };

  const accountHolder = resolveField("accountHolder");
  if (accountHolder.error) {
    return { ok: false, error: "Account holder / practice name is required." };
  }

  const bankName = resolveField("bankName");
  if (bankName.error) {
    return { ok: false, error: "Bank name is required." };
  }

  const branchName = resolveField("branchName");
  if (branchName.error) {
    return { ok: false, error: "Branch name is required." };
  }

  const branchCode = resolveField("branchCode");
  if (branchCode.error) {
    return { ok: false, error: "Branch code is required." };
  }
  if (!/^[0-9A-Za-z-]{3,20}$/.test(branchCode.value)) {
    return {
      ok: false,
      error: "Branch code looks invalid. Use the bank branch code only.",
    };
  }

  const accountNumber = resolveField("accountNumber", {
    normalize: (v) => v.replace(/\D/g, ""),
  });
  if (accountNumber.error && !String(input.accountNumber || "").trim()) {
    return { ok: false, error: "Account number is required." };
  }
  if (accountNumber.error) {
    return { ok: false, error: "Enter the full account number (6–20 digits)." };
  }
  if (!/^\d{6,20}$/.test(accountNumber.value)) {
    return {
      ok: false,
      error: "Account number must be 6–20 digits.",
    };
  }

  const accountType = resolveField("accountType");
  if (accountType.error) {
    return { ok: false, error: "Account type is required." };
  }

  return {
    ok: true,
    data: {
      accountHolder: accountHolder.value,
      bankName: bankName.value,
      branchName: branchName.value,
      branchCode: branchCode.value,
      accountNumber: accountNumber.value,
      accountType: accountType.value,
    },
  };
}

function isBankDetailsComplete(doc) {
  if (!doc) return false;
  // Validate against the raw (unmasked) document stored in DB.
  const result = validateBankDetails(doc);
  return result.ok;
}

module.exports = {
  maskBankField,
  maskAccountNumber,
  isMaskedBankField,
  isMaskedAccountNumber,
  validateBankDetails,
  isBankDetailsComplete,
};
