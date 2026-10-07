/**
 * Valid Namibian mobile numbers stored as 12 digits:
 * 26481XXXXXXX or 26485XXXXXXX
 */
function isValidCellphoneNumber(cellphoneNumber) {
  const numberStr = String(cellphoneNumber);

  if (numberStr.length !== 12) {
    return false;
  }

  if (!/^2648[15]\d{7}$/.test(numberStr)) {
    return false;
  }

  return true;
}

module.exports = { isValidCellphoneNumber };
