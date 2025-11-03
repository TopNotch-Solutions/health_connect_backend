export function isValidCellphoneNumber(cellphoneNumber) {
  const numberStr = String(cellphoneNumber);

  if (numberStr.length !== 12) {
    return false;
  }

  if (!numberStr.startsWith('26481')) {
    return false;
  }

  if (!/^\d+$/.test(numberStr)) {
    return false;
  }

  return true;
}