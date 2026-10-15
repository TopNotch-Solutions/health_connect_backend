/**
 * Mask account number for display: first 2 + last 2 digits, middle as *.
 * Full number is kept for medical aid claim PDFs (loaded from DB directly).
 */
function maskAccountNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) {
    return "*".repeat(digits.length);
  }
  const first = digits.slice(0, 2);
  const last = digits.slice(-2);
  const middle = "*".repeat(digits.length - 4);
  return `${first}${middle}${last}`;
}

function isMaskedAccountNumber(value) {
  return /\*/.test(String(value || ""));
}

/**
 * Validate and normalise provider practice bank details.
 * Returns { ok: true, data } or { ok: false, error }.
 * Pass existingAccountNumber when the client sends a masked value to keep.
 */
function validateBankDetails(input = {}, { existingAccountNumber } = {}) {
  const accountHolder = String(input.accountHolder || "").trim();
  const bankName = String(input.bankName || "").trim();
  const branchName = String(input.branchName || "").trim();
  const branchCode = String(input.branchCode || "").trim();
  let accountNumber = String(input.accountNumber || "").trim();
  const accountType = String(input.accountType || "").trim();

  if (!accountHolder) {
    return { ok: false, error: "Account holder / practice name is required." };
  }
  if (!bankName) {
    return { ok: false, error: "Bank name is required." };
  }
  if (!branchName) {
    return { ok: false, error: "Branch name is required." };
  }
  if (!branchCode) {
    return { ok: false, error: "Branch code is required." };
  }
  if (!/^[0-9A-Za-z-]{3,20}$/.test(branchCode)) {
    return {
      ok: false,
      error: "Branch code looks invalid. Use the bank branch code only.",
    };
  }

  if (isMaskedAccountNumber(accountNumber)) {
    const existing = String(existingAccountNumber || "").replace(/\D/g, "");
    if (!existing || !/^\d{6,20}$/.test(existing)) {
      return {
        ok: false,
        error: "Enter the full account number (6–20 digits).",
      };
    }
    accountNumber = existing;
  } else {
    if (!accountNumber) {
      return { ok: false, error: "Account number is required." };
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return {
        ok: false,
        error: "Account number must be 6–20 digits.",
      };
    }
  }

  if (!accountType) {
    return { ok: false, error: "Account type is required." };
  }

  return {
    ok: true,
    data: {
      accountHolder,
      bankName,
      branchName,
      branchCode,
      accountNumber,
      accountType,
    },
  };
}

function isBankDetailsComplete(doc) {
  if (!doc) return false;
  const result = validateBankDetails(doc);
  return result.ok;
}

module.exports = {
  maskAccountNumber,
  isMaskedAccountNumber,
  validateBankDetails,
  isBankDetailsComplete,
};
